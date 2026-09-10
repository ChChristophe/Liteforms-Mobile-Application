import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useConnectionStore } from '../../stores/connectionStore';
import { buildDesktopUrl, validateHostPort } from '../../lib/network/deviceClient';
import type { WifiProvisioningRequest } from '../../types/device';

/**
 * Connexion manuelle au Desktop (Phase 6, premier flux D3) :
 * 1. saisie IPv4 + port (saisie manuelle obligatoire a ce stade ; mDNS et
 *    provisioning Wi-Fi viennent plus tard dans D3) ;
 * 2. verification du hotspot via `GET /api/provisioning/health` ;
 * 3. saisie des informations du WiFi cible et envoi via
 *    `POST /api/provisioning/wifi` ;
 * 4. oubli des coordonnees du Desktop si besoin.
 *
 * Le mot de passe WiFi est uniquement conserve dans l'etat local du formulaire
 * pendant la saisie ; il n'entre jamais dans Zustand, AsyncStorage ou les
 * logs. iOS peut necessiter un passage manuel dans les reglages WiFi avant
 * le test du hotspot.
 *
 * Au demontage : aucun état persistant modifie sans action utilisateur.
 */
export default function DesktopScreen() {
  const host = useConnectionStore((state) => state.host);
  const port = useConnectionStore((state) => state.port);
  const connectedDesktop = useConnectionStore((state) => state.connectedDesktop);
  const checking = useConnectionStore((state) => state.checking);
  const lastError = useConnectionStore((state) => state.lastError);
  const registerDesktop = useConnectionStore((state) => state.registerDesktop);
  const provisionWifi = useConnectionStore((state) => state.provisionWifi);
  const checkHealth = useConnectionStore((state) => state.checkHealth);
  const forgetDesktop = useConnectionStore((state) => state.forgetDesktop);
  const [hostInput, setHostInput] = useState('');
  const [portInput, setPortInput] = useState('');
  const [wifiSsid, setWifiSsid] = useState('');
  const [wifiPassword, setWifiPassword] = useState('');

  // Hydratation : pre-remplissage avec la session connue.
  const hydrate = useConnectionStore((state) => state.hydrate);
  useEffect(() => {
    void hydrate();
  }, [hydrate]);
  useEffect(() => {
    if (host !== null && hostInput === '') setHostInput(host);
    if (port !== null && portInput === '') setPortInput(String(port));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [host, port]);

  /** Valide la saisie, enregistre les coordonnees et ping le Desktop. */
  async function onTest(): Promise<void> {
    const hostTrimmed = hostInput.trim();
    const portParsed = Number.parseInt(portInput.trim(), 10);
    const validation = validateHostPort(hostTrimmed, portParsed);
    if (!validation.ok) {
      useConnectionStore.setState({ lastError: validation.errors.join(' ') });
      return;
    }
    await registerDesktop(hostTrimmed, portParsed);
  }

  /** Envoie les credentials du WiFi cible au hotspot Electron. */
  async function onProvisionWifi(): Promise<void> {
    const hostTrimmed = hostInput.trim();
    const portParsed = Number.parseInt(portInput.trim(), 10);
    const validation = validateHostPort(hostTrimmed, portParsed);
    if (!validation.ok) {
      useConnectionStore.setState({ lastError: validation.errors.join(' ') });
      return;
    }
    if (wifiSsid.trim().length === 0) {
      useConnectionStore.setState({ lastError: 'Le SSID WiFi est requis.' });
      return;
    }
    const payload: WifiProvisioningRequest = {
      ssid: wifiSsid.trim(),
      password: wifiPassword,
      security: wifiPassword.length > 0 ? 'WPA2-PSK' : 'OPEN',
    };
    const result = await provisionWifi(payload);
    if (result.ok) setWifiPassword('');
  }

  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      <View style={styles.content}>
        <Text style={styles.label}>Adresse du Desktop (IPv4)</Text>
        <TextInput
          style={styles.input}
          value={hostInput}
          onChangeText={setHostInput}
          placeholder="192.168.4.1 (hotspot Electron)"
          placeholderTextColor="#9ca3af"
          keyboardType="numbers-and-punctuation"
          autoCapitalize="none"
          autoCorrect={false}
          inputMode="numeric"
          accessibilityLabel="Adresse IP du Desktop"
        />
        <Text style={styles.label}>Port</Text>
        <TextInput
          style={styles.input}
          value={portInput}
          onChangeText={setPortInput}
          placeholder="8080"
          placeholderTextColor="#9ca3af"
          keyboardType="number-pad"
          accessibilityLabel="Port du Desktop"
        />
        <Text style={styles.label}>WiFi cible a transmettre a Electron</Text>
        <TextInput
          style={styles.input}
          value={wifiSsid}
          onChangeText={setWifiSsid}
          placeholder="SSID du WiFi cible"
          placeholderTextColor="#9ca3af"
          autoCapitalize="none"
          autoCorrect={false}
          accessibilityLabel="SSID du WiFi cible"
        />
        <TextInput
          style={styles.input}
          value={wifiPassword}
          onChangeText={setWifiPassword}
          placeholder="Mot de passe WiFi cible (vide si ouvert)"
          placeholderTextColor="#9ca3af"
          autoCapitalize="none"
          autoCorrect={false}
          secureTextEntry
          accessibilityLabel="Mot de passe du WiFi cible"
        />
        <Text style={styles.hint}>
          Rejoignez d'abord le hotspot Electron dans les réglages WiFi du
          systeme. Le mot de passe cible est envoye une fois puis efface du
          formulaire.
        </Text>
        <Text style={styles.error}>{lastError}</Text>

        <Pressable
          style={[styles.button, checking && styles.buttonDisabled]}
          accessibilityRole="button"
          onPress={() => void onTest()}
        >
          {checking ? (
            <ActivityIndicator color="#ffffff" />
          ) : (
            <Text style={styles.buttonText}>Tester la connexion</Text>
          )}
        </Pressable>

        <Pressable
          style={[styles.secondaryButton, checking && styles.buttonDisabled]}
          accessibilityRole="button"
          onPress={() => void onProvisionWifi()}
          disabled={checking}
        >
          <Text style={styles.secondaryButtonText}>Envoyer le WiFi a Electron</Text>
        </Pressable>

        {connectedDesktop !== null && (
          <View style={styles.statusCard}>
            <Text style={styles.statusOk}>Connecté : {connectedDesktop}</Text>
            <Text style={styles.statusText}>
              {buildDesktopUrl(host ?? '', port ?? 0)}
            </Text>
          </View>
        )}

        {connectedDesktop !== null && (
          <Pressable
            style={styles.forgetButton}
            accessibilityRole="button"
            onPress={() => {
              void forgetDesktop();
            }}
          >
            <Text style={styles.forgetText}>Oublier ce Desktop</Text>
          </Pressable>
        )}

        {connectedDesktop !== null && (
          <Pressable
            style={styles.forgetButton}
            accessibilityRole="button"
            onPress={() => void checkHealth()}
          >
            <Text style={styles.forget}>Reverifier</Text>
          </Pressable>
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#ffffff' },
  content: { flex: 1, padding: 24 },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: '#374151',
    marginBottom: 8,
  },
  input: {
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    color: '#111827',
    backgroundColor: '#f9fafb',
    marginBottom: 8,
  },
  hint: { fontSize: 13, lineHeight: 18, color: '#9ca3af', marginBottom: 8 },
  error: { fontSize: 13, color: '#dc2626', marginBottom: 8 },
  button: {
    minHeight: 44,
    borderRadius: 10,
    backgroundColor: '#4a90d9',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
  },
  buttonDisabled: { opacity: 0.6 },
  buttonText: { color: '#ffffff', fontWeight: '600', fontSize: 15 },
  secondaryButton: {
    minHeight: 44,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#4a90d9',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 12,
  },
  secondaryButtonText: { color: '#2563eb', fontWeight: '600', fontSize: 15 },
  statusCard: {
    marginTop: 16,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#bbf7d0',
    backgroundColor: '#f0fdf4',
    padding: 16,
    gap: 4,
  },
  statusOk: { fontSize: 15, fontWeight: '600', color: '#15803d' },
  statusText: { fontSize: 13, color: '#166534' },
  forgetButton: {
    marginTop: 12,
    minHeight: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  forgetText: { color: '#dc2626', fontSize: 14 },
  forget: { color: '#4a90d9', fontSize: 14 },
});

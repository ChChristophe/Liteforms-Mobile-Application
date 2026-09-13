import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useConnectionStore } from '../../stores/connectionStore';
import { useOnboardingStore } from '../../stores/onboardingStore';
import { validateHostPort, buildDesktopUrl } from '../../lib/network/deviceClient';
import type { WifiProvisioningRequest } from '../../types/device';

/**
 * Parametres -> Connexion avancee (dev/debug). Remplace la saisie IP/port
 * de l'ancien ecran `desktop`, devenu statut simple (dec. 13/09/2026,
 * onboarding « zéro IP » sur `/connect`).
 *
 * - tester une adresse manuelle (health check) ;
 * - provisionner un WiFi via un hotspot cible saisi a la main — fix 13/09 :
 *   les coordonnees envoyees sont celles saisies ici (host/port explicites),
 *   plus jamais `get().host/port` du store ;
 * - oublier ce Desktop ;
 * - relancer l'appairage complet (reset onboarding -> `/connect`).
 *
 * Le mot de passe WiFi ne quitte jamais l'etat local du formulaire.
 */
export default function AdvancedConnectionScreen() {
  const router = useRouter();
  const host = useConnectionStore((s) => s.host);
  const port = useConnectionStore((s) => s.port);
  const connectedDesktop = useConnectionStore((s) => s.connectedDesktop);
  const deviceId = useConnectionStore((s) => s.deviceId);
  const checking = useConnectionStore((s) => s.checking);
  const lastError = useConnectionStore((s) => s.lastError);
  const registerDesktop = useConnectionStore((s) => s.registerDesktop);
  const provisionWifi = useConnectionStore((s) => s.provisionWifi);
  const forgetDesktop = useConnectionStore((s) => s.forgetDesktop);
  const resetOnboarding = useOnboardingStore((s) => s.reset);
  const [hostInput, setHostInput] = useState('');
  const [portInput, setPortInput] = useState('');
  const [hotspotHost, setHotspotHost] = useState('192.168.4.1');
  const [hotspotPort, setHotspotPort] = useState('8080');
  const [wifiSsid, setWifiSsid] = useState('');
  const [wifiPassword, setWifiPassword] = useState('');

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

  /** Envoie les credentials du WiFi cible au hotspot NON saisi. */
  async function onProvisionWifi(): Promise<void> {
    const hotspotHostTrimmed = hotspotHost.trim();
    const hotspotPortParsed = Number.parseInt(hotspotPort.trim(), 10);
    const validation = validateHostPort(hotspotHostTrimmed, hotspotPortParsed);
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
    const result = await provisionWifi(hotspotHostTrimmed, hotspotPortParsed, payload);
    if (result.ok) setWifiPassword('');
  }

  /** Oublie tout puis relance l'appairage automatique. */
  async function onResetPairing(): Promise<void> {
    await resetOnboarding();
    router.replace('/connect');
  }

  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      <View style={styles.content}>
        <Text style={styles.title}>Connexion avancée</Text>
        <Text style={styles.label}>Adresse du Desktop (IPv4)</Text>
        <TextInput
          style={styles.input}
          value={hostInput}
          onChangeText={setHostInput}
          placeholder={host ?? '192.168.1.42'}
          placeholderTextColor="#9ca3af"
          keyboardType="numbers-and-punctuation"
          autoCapitalize="none"
          autoCorrect={false}
          accessibilityLabel="Adresse IP du Desktop"
        />
        <Text style={styles.label}>Port</Text>
        <TextInput
          style={styles.input}
          value={portInput}
          onChangeText={setPortInput}
          placeholder="43178"
          placeholderTextColor="#9ca3af"
          keyboardType="number-pad"
          accessibilityLabel="Port du Desktop"
        />
        <Text style={styles.error}>{lastError}</Text>
        <Pressable
          style={[styles.button, checking && styles.buttonDisabled]}
          accessibilityRole="button"
          disabled={checking}
          onPress={() => void onTest()}
        >
          {checking ? (
            <ActivityIndicator color="#ffffff" />
          ) : (
            <Text style={styles.buttonText}>Tester</Text>
          )}
        </Pressable>

        <Text style={[styles.label, styles.section]}>Provisioning via hotspot</Text>
        <TextInput
          style={styles.input}
          value={hotspotHost}
          onChangeText={setHotspotHost}
          accessibilityLabel="Adresse IP du hotspot"
        />
        <TextInput
          style={styles.input}
          value={hotspotPort}
          onChangeText={setHotspotPort}
          keyboardType="number-pad"
          accessibilityLabel="Port du hotspot"
        />
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
        <Pressable
          style={[styles.secondaryButton, checking && styles.buttonDisabled]}
          accessibilityRole="button"
          disabled={checking}
          onPress={() => void onProvisionWifi()}
        >
          <Text style={styles.secondaryButtonText}>Envoyer le WiFi au hotspot</Text>
        </Pressable>

        {connectedDesktop !== null && host !== null && port !== null && (
          <View style={styles.statusCard}>
            <Text style={styles.statusOk}>Connecté : {connectedDesktop}</Text>
            <Text style={styles.statusText}>
              {deviceId !== null ? `${deviceId} — ` : ''}
              {buildDesktopUrl(host, port)}
            </Text>
          </View>
        )}

        {connectedDesktop !== null && (
          <Pressable
            style={styles.linkButton}
            accessibilityRole="button"
            onPress={() => void forgetDesktop()}
          >
            <Text style={styles.forgetText}>Oublier ce Desktop</Text>
          </Pressable>
        )}

        <Pressable
          style={styles.linkButton}
          accessibilityRole="button"
          onPress={() => void onResetPairing()}
        >
          <Text style={styles.forgetText}>Relancer l'appairage</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#ffffff' },
  content: { padding: 24 },
  title: { fontSize: 24, fontWeight: '700', color: '#111827', marginBottom: 12 },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: '#374151',
    marginBottom: 8,
    marginTop: 8,
  },
  section: { marginTop: 24 },
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
  linkButton: {
    marginTop: 12,
    minHeight: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  forgetText: { color: '#dc2626', fontSize: 14 },
});

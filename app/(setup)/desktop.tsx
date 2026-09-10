import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useConnectionStore } from '../../stores/connectionStore';
import { buildDesktopUrl, validateHostPort } from '../../lib/network/deviceClient';

/**
 * Connexion manuelle au Desktop (Phase 6, premier flux D3) :
 * 1. saisie IPv4 + port (saisie manuelle obligatoire a ce stade ; mDNS et
 *    provisioning Wi-Fi viennent plus tard dans D3) ;
 * 2. saisie optionnelle du token de pairing (secret => SecureStore D1,
 *    jamais affiche ni rejoue a l'ecran) ;
 * 3. bouton "Tester la connexion" : GET /api/health, reception nom/version ;
 * 4. oublie de la session pairée (depairing) si besoin.
 *
 * La verification de compatibilite de version accusee via /api/health est
 * informative ici ; l'envoi de config complet (phase 6, suite) la reimpose
 * avant POST /api/device-config.
 *
 * Au demontage : aucun état persistant modifie sans action utilisateur.
 */
export default function DesktopScreen() {
  const host = useConnectionStore((state) => state.host);
  const port = useConnectionStore((state) => state.port);
  const paired = useConnectionStore((state) => state.paired);
  const connectedDesktop = useConnectionStore((state) => state.connectedDesktop);
  const checking = useConnectionStore((state) => state.checking);
  const lastError = useConnectionStore((state) => state.lastError);
  const registerDesktop = useConnectionStore((state) => state.registerDesktop);
  const checkHealth = useConnectionStore((state) => state.checkHealth);
  const forgetDesktop = useConnectionStore((state) => state.forgetDesktop);
  const [hostInput, setHostInput] = useState('');
  const [portInput, setPortInput] = useState('');
  const [tokenInput, setTokenInput] = useState('');

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

  const canSubmit = !checking && hostInput.length > 0 && portInput.length > 0;

  /** Valide la saisie, enregistre + ping, expose le résultat. */
  async function onTest(): Promise<void> {
    const hostTrimmed = hostInput.trim();
    const portParsed = Number.parseInt(portInput.trim(), 10);
    const validation = validateHostPort(hostTrimmed, portParsed);
    if (!validation.ok) {
      useConnectionStore.setState({ lastError: validation.errors.join(' ') });
      return;
    }
    const tokenTrimmed = tokenInput.trim();
    await registerDesktop(
      hostTrimmed,
      portParsed,
      tokenTrimmed.length > 0 ? tokenTrimmed : null
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      <View style={styles.content}>
        <Text style={styles.label}>Adresse du Desktop (IPv4)</Text>
        <TextInput
          style={styles.input}
          value={hostInput}
          onChangeText={setHostInput}
          placeholder="192.168.1.42"
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
          placeholder="5173"
          placeholderTextColor="#9ca3af"
          keyboardType="number-pad"
          accessibilityLabel="Port du Desktop"
        />
        <Text style={styles.label}>Token de pairing (optionnel)</Text>
        <TextInput
          style={styles.input}
          value={tokenInput}
          onChangeText={setTokenInput}
          placeholder="code affiché par l'application Desktop"
          placeholderTextColor="#9ca3af"
          autoCapitalize="none"
          autoCorrect={false}
          secureTextEntry
          accessibilityLabel="Token de pairing"
        />
        <Text style={styles.hint}>
          Le token est conservé dans le stockage sécurisé du téléphone, il ne
          quitte le téléphone que vers le Desktop pairé. Il n'est jamais
          réaffiché.
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

        {connectedDesktop !== null && (
          <View style={styles.statusCard}>
            <Text style={styles.statusOk}>Connecté : {connectedDesktop}</Text>
            <Text style={styles.statusText}>
              {buildDesktopUrl(host ?? '', port ?? 0)}
            </Text>
            <Text style={styles.statusText}>
              {paired ? 'Session pairée (token enregistré).' : 'Non pairée.'}
            </Text>
          </View>
        )}

        {(connectedDesktop !== null || paired) && (
          <Pressable
            style={styles.forgetButton}
            accessibilityRole="button"
            onPress={() => {
              setTokenInput('');
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

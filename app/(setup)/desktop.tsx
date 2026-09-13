import { useRouter } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useConnectionStore } from '../../stores/connectionStore';

/**
 * Statut de connexion au Desktop, apres l'onboarding « zéro IP »
 * (dec. 13/09/2026) : écran d'information simple.
 *
 * - connecte : nom + deviceId de l'appliance, re-verification possible ;
 * - non connecté : relance de l'onboarding (`/connect`, recherche auto).
 *
 * La saisie manuelle IP/port vit desormais dans `/advanced-connection`
 * (reglages avances, dev/debug) ; ce n'est plus le flux utilisateur.
 *
 * Au demontage : aucun effet de bord.
 */
export default function DesktopScreen() {
  const router = useRouter();
  const host = useConnectionStore((s) => s.host);
  const port = useConnectionStore((s) => s.port);
  const deviceId = useConnectionStore((s) => s.deviceId);
  const connectedDesktop = useConnectionStore((s) => s.connectedDesktop);
  const checking = useConnectionStore((s) => s.checking);
  const lastError = useConnectionStore((s) => s.lastError);
  const checkHealth = useConnectionStore((s) => s.checkHealth);
  const connected = connectedDesktop !== null && host !== null && port !== null;

  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      <View style={styles.content}>
        {connected ? (
          <View style={styles.statusCard}>
            <Text style={styles.statusOk}>Connecté : {connectedDesktop}</Text>
            <Text style={styles.statusText}>
              {connected ? `Appliance ${deviceId ?? 'sans identifiant'} — http://${host}:${port}` : ''}
            </Text>
          </View>
        ) : (
          <View style={styles.hintCard}>
            <Text style={styles.hintText}>
              Aucune appliance connectée. Relancez la recherche automatique
              (réseau WiFi maison ou hotspot Liteforms-Setup-XXXX).
            </Text>
          </View>
        )}
        {lastError !== null && <Text style={styles.error}>{lastError}</Text>}

        {connected && (
          <Pressable
            style={[styles.button, checking && styles.buttonDisabled]}
            accessibilityRole="button"
            disabled={checking}
            onPress={() => void checkHealth()}
          >
            <Text style={styles.buttonText}>
              {checking ? 'Vérification…' : 'Reconnecter / revérifier'}
            </Text>
          </Pressable>
        )}

        <Pressable
          style={styles.secondaryButton}
          accessibilityRole="button"
          onPress={() => router.push('/connect')}
        >
          <Text style={styles.secondaryButtonText}>
            {connected ? 'Réappairer (recherche auto)' : 'Connecter (recherche auto)'}
          </Text>
        </Pressable>

        <Pressable
          style={styles.linkButton}
          accessibilityRole="button"
          onPress={() => router.push('/advanced-connection')}
        >
          <Text style={styles.linkText}>Paramètres avancés (IP / port)</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#ffffff' },
  content: { flex: 1, padding: 24 },
  statusCard: {
    borderWidth: 1,
    borderColor: '#bbf7d0',
    backgroundColor: '#f0fdf4',
    borderRadius: 14,
    padding: 16,
    gap: 4,
  },
  hintCard: {
    borderWidth: 1,
    borderColor: '#e5e7eb',
    backgroundColor: '#f9fafb',
    borderRadius: 14,
    padding: 16,
  },
  statusOk: { fontSize: 15, fontWeight: '600', color: '#15803d' },
  statusText: { fontSize: 13, color: '#166534' },
  hintText: { fontSize: 13, lineHeight: 18, color: '#6b7280' },
  error: { fontSize: 13, color: '#dc2626', marginBottom: 8, marginTop: 8 },
  button: {
    minHeight: 44,
    borderRadius: 10,
    backgroundColor: '#4a90d9',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 16,
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
  linkButton: {
    marginTop: 12,
    minHeight: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  linkText: { color: '#4a90d9', fontSize: 14 },
});

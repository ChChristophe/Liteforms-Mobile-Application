import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import {
  fetchHueStatus,
  pairHue,
  unpairHue,
} from '../../lib/network/hueClient';
import { useConnectionStore } from '../../stores/connectionStore';
import type { HueStatusResponse } from '../../types/device';

/**
 * Ecran « Philips Hue » : appairage pilote depuis le telephone
 * (protocole `DEVICE_API.md` §« Hue (Philips) », 23/09/2026).
 *
 * L'appliance est headless : cet ecran declenche l'activation/l'appairage,
 * le seul geste physique etant l'appui sur le bouton du bridge. Le controle
 * (allumer/eteindre) reste a la voix cote appliance — pas ici.
 *
 * - statut lu via `GET /api/hue/status` (IP du bridge, nombre de lumieres) ;
 * - « Activer / Appairer » lance `POST /api/hue/pair` (bloquant ~35 s) avec
 *   la consigne « appuyez sur le bouton rond » ;
 * - « Desappairer » purge via `POST /api/hue/unpair` ;
 * - aucun secret : la cle Hue vit dans le profil `openhue` de l'appliance.
 *
 * Coordonnees : lues dans `connectionStore` (comme les autres ecrans). Sans
 * appliance connectee, l'ecran n'appelle rien et invite a se connecter.
 *
 * Au demontage : aucune requete n'est annulee explicitement (courtes, bornees
 * par timeout) ; les setters d'etat post-demontage sont sans effet visible
 * (React 19 ignore les mises a jour d'un composant demonte).
 */
export default function HueScreen() {
  const router = useRouter();
  const host = useConnectionStore((s) => s.host);
  const port = useConnectionStore((s) => s.port);
  const connected = host !== null && port !== null;

  const [status, setStatus] = useState<HueStatusResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [pairing, setPairing] = useState(false);
  const [unpairing, setUnpairing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const busy = loading || pairing || unpairing;

  /** Relit le statut Hue de l'appliance (no-op si non connecte). */
  const refresh = useCallback(async () => {
    if (host === null || port === null) return;
    setLoading(true);
    setError(null);
    try {
      const result = await fetchHueStatus(host, port);
      if (result.ok) setStatus(result);
      else setError(result.error);
    } finally {
      setLoading(false);
    }
  }, [host, port]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  /** Declenche l'appairage (route bloquante) puis relit le statut. */
  async function onPair(): Promise<void> {
    if (host === null || port === null) return;
    setPairing(true);
    setError(null);
    try {
      const result = await pairHue(host, port);
      if (result.ok) {
        await refresh();
      } else {
        setError(result.error);
      }
    } finally {
      setPairing(false);
    }
  }

  /** Purge la configuration Hue de l'appliance. */
  async function onUnpair(): Promise<void> {
    if (host === null || port === null) return;
    setUnpairing(true);
    setError(null);
    try {
      const result = await unpairHue(host, port);
      if (result.ok) {
        setStatus({ ok: true, paired: false, bridgeIp: null, lightCount: null });
      } else {
        setError(result.error);
      }
    } finally {
      setUnpairing(false);
    }
  }

  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      <ScrollView contentContainerStyle={styles.content}>
        {!connected ? (
          <View style={styles.hintCard}>
            <Text style={styles.hintText}>
              Aucune appliance connectée. Connectez-vous d'abord pour piloter
              Philips Hue depuis le téléphone.
            </Text>
            <Pressable
              style={styles.secondaryButton}
              accessibilityRole="button"
              onPress={() => router.push('/connect')}
            >
              <Text style={styles.secondaryButtonText}>Connecter l'appliance</Text>
            </Pressable>
          </View>
        ) : (
          <>
            <View style={styles.statusCard}>
              {loading && status === null ? (
                <Text style={styles.statusText}>Lecture du statut Hue…</Text>
              ) : status === null ? (
                <Text style={styles.statusText}>Statut Hue indisponible.</Text>
              ) : status.paired ? (
                <>
                  <Text style={styles.statusOk}>Hue appairé</Text>
                  <Text style={styles.statusText}>
                    Bridge : {status.bridgeIp ?? 'inconnu'}
                  </Text>
                  <Text style={styles.statusText}>
                    {status.lightCount === null
                      ? 'Lumières : inconnu'
                      : `${status.lightCount} lumière${status.lightCount > 1 ? 's' : ''}`}
                  </Text>
                </>
              ) : (
                <>
                  <Text style={styles.statusOff}>Hue non appairé</Text>
                  <Text style={styles.statusText}>
                    Appairez le bridge pour activer le contrôle à la voix.
                  </Text>
                </>
              )}
            </View>

            {pairing && (
              <View style={styles.pairingBox}>
                <ActivityIndicator color="#4a90d9" />
                <Text style={styles.pairingText}>
                  Appuyez sur le bouton rond du bridge Hue pendant la recherche.
                </Text>
              </View>
            )}

            {error !== null && <Text style={styles.error}>{error}</Text>}

            <Pressable
              style={[styles.button, busy && styles.buttonDisabled]}
              accessibilityRole="button"
              disabled={busy}
              onPress={() => void onPair()}
            >
              <Text style={styles.buttonText}>
                {pairing
                  ? 'Recherche du bridge…'
                  : status?.paired
                    ? 'Réappairer'
                    : 'Activer / Appairer'}
              </Text>
            </Pressable>

            <Pressable
              style={[styles.secondaryButton, busy && styles.buttonDisabled]}
              accessibilityRole="button"
              disabled={busy || !(status?.paired ?? false)}
              onPress={() => void onUnpair()}
            >
              <Text style={styles.secondaryButtonText}>
                {unpairing ? 'Désappairage…' : 'Désappairer'}
              </Text>
            </Pressable>

            <Pressable
              style={[styles.linkButton, busy && styles.buttonDisabled]}
              accessibilityRole="button"
              disabled={busy}
              onPress={() => void refresh()}
            >
              <Text style={styles.linkText}>
                {loading ? 'Rafraîchissement…' : 'Rafraîchir'}
              </Text>
            </Pressable>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#ffffff' },
  content: { padding: 24, paddingBottom: 48 },
  statusCard: {
    borderWidth: 1,
    borderColor: '#e5e7eb',
    backgroundColor: '#f9fafb',
    borderRadius: 14,
    padding: 16,
    gap: 4,
  },
  statusOk: { fontSize: 15, fontWeight: '600', color: '#15803d' },
  statusOff: { fontSize: 15, fontWeight: '600', color: '#b45309' },
  statusText: { fontSize: 13, lineHeight: 18, color: '#6b7280' },
  hintCard: {
    borderWidth: 1,
    borderColor: '#e5e7eb',
    backgroundColor: '#f9fafb',
    borderRadius: 14,
    padding: 16,
  },
  hintText: { fontSize: 13, lineHeight: 18, color: '#6b7280' },
  pairingBox: {
    marginTop: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderWidth: 1,
    borderColor: '#bfdbfe',
    backgroundColor: '#eff6ff',
    borderRadius: 14,
    padding: 16,
  },
  pairingText: { flex: 1, fontSize: 14, lineHeight: 20, color: '#1d4ed8' },
  error: { fontSize: 13, color: '#dc2626', marginTop: 12 },
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

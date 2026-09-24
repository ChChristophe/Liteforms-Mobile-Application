import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import {
  fetchSpotifyDevices,
  setSpotifyAlias,
  setSpotifyDefault,
} from '../../lib/network/spotifyClient';
import { useConnectionStore } from '../../stores/connectionStore';
import type { SpotifyDevice } from '../../types/device';

/**
 * Ecran « Appareils Spotify » : nommage (alias) et choix de l'appareil par
 * defaut (protocole `DEVICE_API.md` §« Spotify — appareils », 24/09/2026).
 *
 * Les noms vivent **cote appliance** (source unique, partagee avec l'agent
 * OpenClaw) : cet ecran ne fait que les ecrire via les routes LAN. Aucun
 * secret ne transite ; le nommage fonctionne sans OAuth (il suffit d'une
 * appliance connectee, meme si Spotify n'est pas encore relie).
 *
 * UI calquee sur `app/(setup)/news.tsx` (SafeAreaView, ScrollView, TextInput,
 * Pressable, styles FR). Au demontage : requetes courtes bornees par timeout.
 */
export default function SpotifyDevicesScreen() {
  const router = useRouter();
  const host = useConnectionStore((s) => s.host);
  const port = useConnectionStore((s) => s.port);
  const connected = host !== null && port !== null;

  const [devices, setDevices] = useState<SpotifyDevice[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [aliasEdits, setAliasEdits] = useState<Record<string, string>>({});
  const [savingId, setSavingId] = useState<string | null>(null);
  const [defaultId, setDefaultId] = useState<string | null>(null);

  const busy = loading || savingId !== null || defaultId !== null;

  /** Relit la liste des appareils Spotify (no-op si non connecte). */
  const refresh = useCallback(async () => {
    if (host === null || port === null) return;
    setLoading(true);
    setError(null);
    try {
      const result = await fetchSpotifyDevices(host, port);
      if (result.ok) setDevices(result.devices);
      else setError(result.error);
    } finally {
      setLoading(false);
    }
  }, [host, port]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  /** Enregistre l'alias saisi pour un appareil (vide = effacer). */
  async function onSaveAlias(device: SpotifyDevice): Promise<void> {
    if (host === null || port === null) return;
    const alias = (aliasEdits[device.id] ?? device.alias ?? '').trim();
    setSavingId(device.id);
    setError(null);
    setMessage(null);
    try {
      const result = await setSpotifyAlias(host, port, { id: device.id, alias });
      if (result.ok) {
        setMessage(`Nom enregistré : ${alias.length > 0 ? alias : device.name}.`);
        await refresh();
      } else {
        setError(result.error);
      }
    } finally {
      setSavingId(null);
    }
  }

  /** Bascule l'appareil par defaut (deja par defaut = retirer le defaut). */
  async function onToggleDefault(device: SpotifyDevice): Promise<void> {
    if (host === null || port === null) return;
    setDefaultId(device.id);
    setError(null);
    setMessage(null);
    try {
      const next = device.isDefault ? null : device.id;
      const result = await setSpotifyDefault(host, port, next);
      if (result.ok) {
        setMessage(
          next === null
            ? 'Aucun appareil par défaut.'
            : `${(aliasEdits[device.id] ?? device.alias ?? device.name)} est l'appareil par défaut.`
        );
        await refresh();
      } else {
        setError(result.error);
      }
    } finally {
      setDefaultId(null);
    }
  }

  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      <ScrollView contentContainerStyle={styles.content}>
        {!connected ? (
          <View style={styles.hintCard}>
            <Text style={styles.hintText}>
              Aucune appliance connectée. Connectez-vous d'abord pour nommer les
              appareils Spotify depuis le téléphone.
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
              {loading && devices === null ? (
                <Text style={styles.statusText}>Lecture des appareils Spotify…</Text>
              ) : devices === null ? (
                <Text style={styles.statusText}>Appareils Spotify indisponibles.</Text>
              ) : devices.length === 0 ? (
                <>
                  <Text style={styles.statusOff}>Aucun appareil</Text>
                  <Text style={styles.statusText}>
                    Ouvre l'app Spotify sur l'appareil cible (TV, enceinte,
                    ordinateur) puis rafraîchis.
                  </Text>
                </>
              ) : (
                <>
                  <Text style={styles.statusOk}>
                    {devices.length} appareil{devices.length > 1 ? 's' : ''}
                  </Text>
                  <Text style={styles.statusText}>
                    Donne un nom à chaque appareil, puis choisis celui utilisé
                    par défaut.
                  </Text>
                </>
              )}
            </View>

            {devices !== null &&
              devices.map((device) => {
                const aliasValue = aliasEdits[device.id] ?? device.alias ?? '';
                return (
                  <View key={device.id} style={styles.deviceCard}>
                    <View style={styles.deviceHeader}>
                      <Text style={styles.deviceName}>{device.name}</Text>
                      <Text style={styles.deviceMeta}>
                        {device.type}
                        {device.isActive ? ' · en lecture' : ''}
                        {device.isDefault ? ' · par défaut' : ''}
                      </Text>
                    </View>
                    <TextInput
                      style={styles.input}
                      placeholder="Nom personnalisé (ex. TV Salon)"
                      value={aliasValue}
                      editable={!busy}
                      onChangeText={(text) =>
                        setAliasEdits((edits) => ({ ...edits, [device.id]: text }))
                      }
                      accessibilityLabel={`Nom de ${device.name}`}
                    />
                    <View style={styles.deviceActions}>
                      <Pressable
                        style={[styles.saveButton, busy && styles.buttonDisabled]}
                        accessibilityRole="button"
                        accessibilityLabel={`Enregistrer le nom de ${device.name}`}
                        disabled={busy}
                        onPress={() => void onSaveAlias(device)}
                      >
                        <Text style={styles.saveButtonText}>
                          {savingId === device.id ? 'Enregistrement…' : 'Enregistrer'}
                        </Text>
                      </Pressable>
                      <Pressable
                        style={[
                          styles.defaultButton,
                          device.isDefault && styles.defaultButtonActive,
                          busy && styles.buttonDisabled,
                        ]}
                        accessibilityRole="button"
                        accessibilityLabel={
                          device.isDefault
                            ? `Retirer ${device.name} par défaut`
                            : `Définir ${device.name} par défaut`
                        }
                        disabled={busy}
                        onPress={() => void onToggleDefault(device)}
                      >
                        <Text
                          style={[
                            styles.defaultButtonText,
                            device.isDefault && styles.defaultButtonTextActive,
                          ]}
                        >
                          {defaultId === device.id
                            ? '…'
                            : device.isDefault
                              ? 'Retirer le défaut'
                              : 'Par défaut'}
                        </Text>
                      </Pressable>
                    </View>
                  </View>
                );
              })}

            {error !== null && <Text style={styles.error}>{error}</Text>}
            {message !== null && <Text style={styles.success}>{message}</Text>}

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
  deviceCard: {
    borderWidth: 1,
    borderColor: '#e5e7eb',
    backgroundColor: '#ffffff',
    borderRadius: 14,
    padding: 16,
    marginTop: 12,
    gap: 10,
  },
  deviceHeader: { gap: 2 },
  deviceName: { fontSize: 15, fontWeight: '600', color: '#111827' },
  deviceMeta: { fontSize: 12, color: '#9ca3af' },
  input: {
    minHeight: 44,
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 10,
    paddingHorizontal: 12,
    fontSize: 15,
    color: '#111827',
  },
  deviceActions: { flexDirection: 'row', gap: 10 },
  saveButton: {
    flex: 1,
    minHeight: 40,
    borderRadius: 10,
    backgroundColor: '#4a90d9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  saveButtonText: { color: '#ffffff', fontWeight: '600', fontSize: 14 },
  defaultButton: {
    flex: 1,
    minHeight: 40,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#4a90d9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  defaultButtonActive: { backgroundColor: '#dcfce7', borderColor: '#15803d' },
  defaultButtonText: { color: '#2563eb', fontWeight: '600', fontSize: 14 },
  defaultButtonTextActive: { color: '#15803d' },
  buttonDisabled: { opacity: 0.6 },
  error: { fontSize: 13, color: '#dc2626', marginTop: 12 },
  success: { fontSize: 13, color: '#15803d', marginTop: 12 },
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

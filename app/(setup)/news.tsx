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
  addNewsFeed,
  fetchNewsStatus,
  removeNewsFeed,
  scanNews,
  setupNews,
} from '../../lib/network/newsClient';
import { useConnectionStore } from '../../stores/connectionStore';
import type { NewsStatusResponse } from '../../types/device';

/**
 * Ecran « Revue de presse » : gestion de la liste des flux suivis par le
 * skill OpenClaw `blogwatcher` de l'appliance (protocole `DEVICE_API.md`
 * §« Revue de presse (blogwatcher) », 24/09/2026).
 *
 * L'appliance est headless : cet ecran ajoute/retire des flux et declenche
 * l'analyse, la lecture restant a la voix cote appliance. Le Mobile ne parle
 * jamais directement aux flux et ne stocke rien (source de verite = SQLite de
 * l'appliance). Aucun secret ne transite.
 *
 * - statut lu via `GET /api/news/status` (flux suivis + non lus) ;
 * - ajout via `POST /api/news/feeds` (validation locale minimale en amont) ;
 * - retrait via `POST /api/news/feeds/remove` ;
 * - « Rechercher de nouveaux articles » lance `POST /api/news/scan`
 *   (bloquant ~60 s) et affiche le nombre de nouveaux articles.
 *
 * Coordonnees : lues dans `connectionStore` (comme les autres ecrans). Sans
 * appliance connectee, l'ecran n'appelle rien et invite a se connecter.
 *
 * Au demontage : aucune requete n'est annulee explicitement (bornees par
 * timeout) ; les setters d'etat post-demontage sont sans effet visible
 * (React 19 ignore les mises a jour d'un composant demonte).
 */
export default function NewsScreen() {
  const router = useRouter();
  const host = useConnectionStore((s) => s.host);
  const port = useConnectionStore((s) => s.port);
  const connected = host !== null && port !== null;

  const [status, setStatus] = useState<NewsStatusResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [adding, setAdding] = useState(false);
  const [removingName, setRemovingName] = useState<string | null>(null);
  const [scanning, setScanning] = useState(false);
  const [installing, setInstalling] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [scanMessage, setScanMessage] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [url, setUrl] = useState('');

  const busy = loading || adding || removingName !== null || scanning || installing;

  /** Relit le statut de la revue de presse (no-op si non connecte). */
  const refresh = useCallback(async () => {
    if (host === null || port === null) return;
    setLoading(true);
    setError(null);
    try {
      const result = await fetchNewsStatus(host, port);
      if (result.ok) setStatus(result);
      else setError(result.error);
    } finally {
      setLoading(false);
    }
  }, [host, port]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  /** Ajoute un flux apres validation locale minimale. */
  async function onAdd(): Promise<void> {
    if (host === null || port === null) return;
    const trimmedName = name.trim();
    const trimmedUrl = url.trim();
    if (trimmedName.length === 0) {
      setError('Indique un nom pour le flux.');
      return;
    }
    if (!/^https?:\/\/\S+$/i.test(trimmedUrl)) {
      setError("L'adresse doit commencer par http:// ou https://.");
      return;
    }
    setAdding(true);
    setError(null);
    setScanMessage(null);
    try {
      const result = await addNewsFeed(host, port, {
        name: trimmedName,
        url: trimmedUrl,
      });
      if (result.ok) {
        setName('');
        setUrl('');
        await refresh();
      } else {
        setError(result.error);
      }
    } finally {
      setAdding(false);
    }
  }

  /** Retire un flux suivi (et ses articles joints). */
  async function onRemove(feedName: string): Promise<void> {
    if (host === null || port === null) return;
    setRemovingName(feedName);
    setError(null);
    setScanMessage(null);
    try {
      const result = await removeNewsFeed(host, port, feedName);
      if (result.ok) {
        await refresh();
      } else {
        setError(result.error);
      }
    } finally {
      setRemovingName(null);
    }
  }

  /** Lance l'analyse (route bloquante ~60 s) puis relit le statut. */
  async function onScan(): Promise<void> {
    if (host === null || port === null) return;
    setScanning(true);
    setError(null);
    setScanMessage(null);
    try {
      const result = await scanNews(host, port);
      if (result.ok) {
        setScanMessage(
          `${result.newArticles} nouvel(s) article(s) trouvé(s).`
        );
        await refresh();
      } else {
        setError(result.error);
      }
    } finally {
      setScanning(false);
    }
  }

  /**
   * Installe la CLI blogwatcher cote appliance (route bloquante ~60 s), puis
   * relit le statut : en succes l'appliance repasse a `available: true`.
   */
  async function onInstall(): Promise<void> {
    if (host === null || port === null) return;
    setInstalling(true);
    setError(null);
    setScanMessage(null);
    try {
      const result = await setupNews(host, port);
      if (result.ok) {
        setScanMessage(
          result.installed
            ? `blogwatcher ${result.version} installé.`
            : `blogwatcher ${result.version} était déjà installé.`
        );
        await refresh();
      } else {
        setError(result.error);
      }
    } finally {
      setInstalling(false);
    }
  }

  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      <ScrollView contentContainerStyle={styles.content}>
        {!connected ? (
          <View style={styles.hintCard}>
            <Text style={styles.hintText}>
              Aucune appliance connectée. Connectez-vous d'abord pour gérer la
              revue de presse depuis le téléphone.
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
                <Text style={styles.statusText}>Lecture de la revue de presse…</Text>
              ) : status === null ? (
                <Text style={styles.statusText}>
                  Revue de presse indisponible.
                </Text>
              ) : !status.available ? (
                <>
                  <Text style={styles.statusOff}>blogwatcher indisponible</Text>
                  <Text style={styles.statusText}>
                    L'appliance n'a pas la commande blogwatcher. Installez-la
                    depuis le téléphone (téléchargement ~60 s).
                  </Text>
                  <Pressable
                    style={[styles.button, busy && styles.buttonDisabled]}
                    accessibilityRole="button"
                    disabled={busy}
                    onPress={() => void onInstall()}
                  >
                    <View style={styles.buttonInner}>
                      {installing && <ActivityIndicator color="#ffffff" />}
                      <Text style={styles.buttonText}>
                        {installing ? 'Installation…' : 'Installer blogwatcher'}
                      </Text>
                    </View>
                  </Pressable>
                  <Text style={styles.feedMeta}>
                    Hors plateforme supportée, prévoir la variable BLOGWATCHER_BIN.
                  </Text>
                </>
              ) : (
                <>
                  <Text style={styles.statusOk}>
                    {status.unreadCount === null
                      ? 'Revue de presse'
                      : `${status.unreadCount} article${status.unreadCount > 1 ? 's' : ''} non lu${status.unreadCount > 1 ? 's' : ''}`}
                  </Text>
                  {status.feeds.length === 0 ? (
                    <Text style={styles.statusText}>
                      Aucun flux suivi. Ajoutez-en un ci-dessous.
                    </Text>
                  ) : (
                    status.feeds.map((feed) => (
                      <View key={feed.name} style={styles.feedRow}>
                        <View style={styles.feedText}>
                          <Text style={styles.feedName}>{feed.name}</Text>
                          <Text style={styles.statusText}>{feed.url}</Text>
                          {feed.feedUrl !== null && (
                            <Text style={styles.statusText}>{feed.feedUrl}</Text>
                          )}
                          <Text style={styles.feedMeta}>
                            {feed.lastScanned === null
                              ? 'Jamais analysé'
                              : `Analysé le ${formatLastScanned(feed.lastScanned)}`}
                          </Text>
                        </View>
                        <Pressable
                          style={[styles.removeButton, busy && styles.buttonDisabled]}
                          accessibilityRole="button"
                          accessibilityLabel={`Retirer ${feed.name}`}
                          disabled={busy}
                          onPress={() => void onRemove(feed.name)}
                        >
                          <Text style={styles.removeButtonText}>
                            {removingName === feed.name ? 'Retrait…' : 'Retirer'}
                          </Text>
                        </Pressable>
                      </View>
                    ))
                  )}
                </>
              )}
            </View>

            <View style={styles.formCard}>
              <Text style={styles.formTitle}>Ajouter un flux</Text>
              <TextInput
                style={styles.input}
                placeholder="Nom du flux"
                value={name}
                editable={!busy}
                onChangeText={setName}
                autoCapitalize="none"
                accessibilityLabel="Nom du flux"
              />
              <TextInput
                style={styles.input}
                placeholder="https://exemple.com"
                value={url}
                editable={!busy}
                onChangeText={setUrl}
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="url"
                accessibilityLabel="Adresse du flux"
              />
              <Pressable
                style={[styles.button, busy && styles.buttonDisabled]}
                accessibilityRole="button"
                disabled={busy}
                onPress={() => void onAdd()}
              >
                <Text style={styles.buttonText}>
                  {adding ? 'Ajout…' : 'Ajouter le flux'}
                </Text>
              </Pressable>
            </View>

            {scanning && (
              <View style={styles.scanningBox}>
                <ActivityIndicator color="#4a90d9" />
                <Text style={styles.scanningText}>Analyse en cours…</Text>
              </View>
            )}

            {error !== null && <Text style={styles.error}>{error}</Text>}
            {scanMessage !== null && (
              <Text style={styles.success}>{scanMessage}</Text>
            )}

            <Pressable
              style={[styles.button, busy && styles.buttonDisabled]}
              accessibilityRole="button"
              disabled={busy}
              onPress={() => void onScan()}
            >
              <Text style={styles.buttonText}>
                {scanning
                  ? 'Analyse en cours…'
                  : 'Rechercher de nouveaux articles'}
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

/**
 * Formate un horodatage ISO 8601 en date lisible (fr-FR). Retourne la valeur
 * brute si elle n'est pas une date exploitable (jamais de crash).
 */
function formatLastScanned(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString('fr-FR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
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
  feedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderTopWidth: 1,
    borderTopColor: '#e5e7eb',
    paddingTop: 12,
    marginTop: 8,
  },
  feedText: { flex: 1, gap: 2 },
  feedName: { fontSize: 14, fontWeight: '600', color: '#111827' },
  feedMeta: { fontSize: 12, color: '#9ca3af' },
  removeButton: {
    minHeight: 36,
    paddingHorizontal: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#dc2626',
    alignItems: 'center',
    justifyContent: 'center',
  },
  removeButtonText: { color: '#dc2626', fontWeight: '600', fontSize: 13 },
  formCard: {
    borderWidth: 1,
    borderColor: '#e5e7eb',
    backgroundColor: '#ffffff',
    borderRadius: 14,
    padding: 16,
    marginTop: 16,
    gap: 10,
  },
  formTitle: { fontSize: 15, fontWeight: '600', color: '#111827' },
  input: {
    minHeight: 44,
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 10,
    paddingHorizontal: 12,
    fontSize: 15,
    color: '#111827',
  },
  hintCard: {
    borderWidth: 1,
    borderColor: '#e5e7eb',
    backgroundColor: '#f9fafb',
    borderRadius: 14,
    padding: 16,
  },
  hintText: { fontSize: 13, lineHeight: 18, color: '#6b7280' },
  scanningBox: {
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
  scanningText: { flex: 1, fontSize: 14, lineHeight: 20, color: '#1d4ed8' },
  error: { fontSize: 13, color: '#dc2626', marginTop: 12 },
  success: { fontSize: 13, color: '#15803d', marginTop: 12 },
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
  buttonInner: { flexDirection: 'row', alignItems: 'center', gap: 8 },
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

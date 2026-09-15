import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useConfigStore } from '../../stores/configStore';
import { useConnectionStore } from '../../stores/connectionStore';
import { fetchVrmList } from '../../lib/network/deviceClient';
import {
  clearResidentVrm,
  saveResidentVrmMeta,
} from '../../lib/storage/residentVrm';
import {
  startVrmDownload,
  type VrmDownloadTask,
} from '../../lib/network/vrmDownload';
import type { VrmSummary } from '../../types/device';

/**
 * Ecran de selection du modele VRM (Phase 3 etape 5 + Phase 5, decision D2).
 *
 * Si un Desktop est connecte (connectionStore), la bibliothèque reelle
 * `GET /api/device/vrms` est affichee ; selectionner un VRM du catalogue
 * TELECHARGE le binaire Desktop -> telephone (D2, 15/09/2026) avec barre de
 * progression, puis met a jour `modelRef {id, fileName, hash: md5}` :
 * - le binaire resident REMPLACE le precedent (un seul resident a la fois,
 *   ecriture atomique `.part` → renommage, cf. `lib/storage/residentVrm`) ;
 * - le preview natif charge le resident a chaud (expressions mood
 *   affichables en preview avant l'envoi, raison du D2) ;
 * - echec : message clair + retenter (jamais de modelRef partiel mis a jour,
 *   jamais de crash) ; annulation au demontage (cancelAsync + purge `.part`).
 *
 * Selection builtin : PAS de telechargement (le bundle est deja resident) ;
 * le resident eventuel est purge pour rester « un seul resident ».
 * Hors connexion : la reference `{id, fileName, hash}` reste editable a la
 * main (fallback hors ligne, POC utilisable sans Desktop).
 *
 * Validation : modelRef vide est refuse par `validateDeviceConfig`,
 * donc la persistance saute tant qu'un des deux champs est vide —
 * l'utilisateur voit l'erreur de champ correspondante.
 */
/** Taille lisible en Mo (une decimale). */
function formatMo(sizeBytes: number): string {
  return `${(sizeBytes / (1024 * 1024)).toFixed(1)} Mo`;
}

export default function VrmSelectScreen() {
  const modelRef = useConfigStore((state) => state.config.avatar.modelRef);
  const updateAvatar = useConfigStore((state) => state.updateAvatar);
  const host = useConnectionStore((state) => state.host);
  const port = useConnectionStore((state) => state.port);
  const connectedDesktop = useConnectionStore((state) => state.connectedDesktop);

  const [idError, setIdError] = useState<string | null>(null);
  const [fileNameError, setFileNameError] = useState<string | null>(null);
  const [vrms, setVrms] = useState<VrmSummary[] | null>(null);
  const [vrmsLoading, setVrmsLoading] = useState(false);
  const [vrmsError, setVrmsError] = useState<string | null>(null);
  /** Telechargement en cours : nom + fraction de progression (throttle 10 %). */
  const [downloading, setDownloading] = useState<{
    fileName: string;
    progress: number | null;
  } | null>(null);
  /** Echec visible du dernier telechargement tente (fileName + raison). */
  const [downloadError, setDownloadError] = useState<{
    fileName: string;
    message: string;
  } | null>(null);
  /** Tache en cours : annulee au demontage (cancelAsync + purge .part). */
  const taskRef = useRef<VrmDownloadTask | null>(null);

  useEffect(
    () => () => {
      void taskRef.current?.cancel();
      taskRef.current = null;
    },
    []
  );

  // Au montage : charge la bibliotheque VRM reelle du Desktop connecte.
  // Site non connecte ou erreur : la reference manuelle reste utilisable.
  useEffect(() => {
    let cancelled = false;
    if (connectedDesktop === null || host === null || port === null) {
      return;
    }
    setVrmsLoading(true);
    setVrmsError(null);
    void (async () => {
      const result = await fetchVrmList(host, port);
      if (cancelled) return;
      setVrmsLoading(false);
      if (result.ok) setVrms(result.vrms);
      else setVrmsError(result.error);
    })();
    return () => {
      cancelled = true;
    };
  }, [connectedDesktop, host, port]);

  /**
   * Selection dans le catalogue. Non-builtin : telecharge Desktop -> Mobile
   * (progression throtlee cote download, <= 10 setState par fichier), puis
   * resident remplacé (atomique) et modelRef {id, fileName, hash: md5}.
   */
  function selectVrm(vrm: VrmSummary): void {
    setIdError(null);
    setFileNameError(null);
    setDownloadError(null);
    if (vrm.builtin === true) {
      // Modele integre : deja resident en bundle, rien a telecharger (D2) ;
      // le resident Desktop eventuel est purge (un seul resident, D2).
      taskRef.current = null;
      void clearResidentVrm();
      updateAvatar({
        modelRef: { id: vrm.id, fileName: vrm.fileName, hash: null },
      });
      return;
    }
    if (connectedDesktop === null || host === null || port === null) {
      setDownloadError({
        fileName: vrm.fileName,
        message: 'Desktop non connecté : téléchargement impossible.',
      });
      return;
    }
    const task = startVrmDownload(host, port, vrm.fileName, (progress) => {
      // Throttle amont (paliers 10 %) : <= 10 re-renders par fichier.
      setDownloading({ fileName: vrm.fileName, progress });
    });
    taskRef.current = task;
    setDownloading({ fileName: vrm.fileName, progress: null });
    void task.promise.then((result) => {
      taskRef.current = null;
      setDownloading(null);
      if (!result.ok) {
        if (result.cancelled) return; // demontage : ni erreur ni modelRef
        setDownloadError({ fileName: vrm.fileName, message: result.error });
        return;
      }
      void (async () => {
        try {
          await saveResidentVrmMeta({
            fileName: vrm.fileName,
            hash: result.md5,
          });
        } catch (error) {
          if (__DEV__) console.warn('[vrm-select] resident meta failed', error);
          setDownloadError({
            fileName: vrm.fileName,
            message: 'Échec de la sauvegarde locale du VRM.',
          });
          return;
        }
        updateAvatar({
          modelRef: { id: vrm.id, fileName: vrm.fileName, hash: result.md5 },
        });
      })();
    });
  }

  /** Commite l'id et affiche l'erreur de champ si vide. */
  function commitId(value: string): void {
    const trimmed = value.trim();
    setIdError(trimmed.length === 0 ? 'Identifiant requis.' : null);
    if (trimmed.length > 0) {
      updateAvatar({ modelRef: { ...modelRef, id: trimmed } });
    }
  }

  /** Commite le nom de fichier et affiche l'erreur de champ si vide. */
  function commitFileName(value: string): void {
    const trimmed = value.trim();
    setFileNameError(trimmed.length === 0 ? 'Nom de fichier requis.' : null);
    if (trimmed.length > 0) {
      updateAvatar({ modelRef: { ...modelRef, fileName: trimmed } });
    }
  }

  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.label}>Modèle actuel</Text>
        <View style={styles.card}>
          <Text style={styles.cardTitle}>{modelRef.fileName}</Text>
          <Text style={styles.cardText}>id : {modelRef.id}</Text>
          <Text style={styles.cardText}>
            hash : {modelRef.hash ?? 'non calculé (contrat Desktop)'}
          </Text>
        </View>

        <Text style={styles.label}>Bibliothèque du Desktop</Text>
        {vrmsLoading && <ActivityIndicator />}
        {vrmsError !== null && (connectedDesktop !== null) && (
          <Text style={styles.note}>
            Liste du Desktop indisponible ({vrmsError}). Saisie manuelle
            ci-dessous toujours possible.
          </Text>
        )}
        {connectedDesktop === null && (
          <Text style={styles.note}>
            Desktop non connecté : saisis la référence manuellement ci-dessous.
          </Text>
        )}
        {vrms !== null && vrms.length === 0 && (
          <Text style={styles.note}>
            Aucun VRM dans la bibliothèque du Desktop.
          </Text>
        )}
        {vrms !== null &&
          vrms.length > 0 &&
          vrms.map((vrm) => {
            const selected =
              vrm.fileName === modelRef.fileName &&
              downloading?.fileName !== vrm.fileName;
            const isDownloading = downloading?.fileName === vrm.fileName;
            const hasError = downloadError?.fileName === vrm.fileName;
            return (
              <View key={vrm.id}>
                <Pressable
                  style={[styles.card, selected && styles.cardSelected]}
                  onPress={() => selectVrm(vrm)}
                  disabled={isDownloading}
                  accessibilityLabel={`Sélectionner le modèle ${vrm.fileName}`}
                >
                  <Text style={styles.cardTitle}>
                    {vrm.fileName}
                    {vrm.builtin === true ? ' (intégré)' : ''}
                  </Text>
                  <Text style={styles.cardText}>
                    id : {vrm.id} · {formatMo(vrm.sizeBytes)}
                    {selected ? ' · sélectionné' : ''}
                  </Text>
                  {isDownloading && (
                    <View
                      style={styles.progressTrack}
                      accessibilityLabel={
                        'Téléchargement du modèle ' + vrm.fileName
                      }
                    >
                      <View
                        style={[
                          styles.progressFill,
                          { width: `${Math.round((downloading?.progress ?? 0) * 100)}%` },
                        ]}
                      />
                    </View>
                  )}
                  {isDownloading && (
                    <Text style={styles.cardText}>
                      Téléchargement…
                      {downloading?.progress !== null
                        ? ` ${Math.round((downloading?.progress ?? 0) * 100)} %`
                        : ''}
                    </Text>
                  )}
                </Pressable>
                {hasError && !isDownloading && (
                  <Text style={styles.error}>
                    Téléchargement échoué ({downloadError?.message}) —{' '}
                    <Text onPress={() => selectVrm(vrm)} style={styles.retry}>
                      Retenter
                    </Text>
                  </Text>
                )}
              </View>
            );
          })}

        <Text style={[styles.label, styles.fieldGap]}>Identifiant de catalogue (id)</Text>
        <TextInput
          style={styles.input}
          value={modelRef.id}
          onChangeText={(text) => updateAvatar({ modelRef: { ...modelRef, id: text } })}
          onEndEditing={() => commitId(modelRef.id)}
          placeholder="lobsterEdit"
          placeholderTextColor="#9ca3af"
          autoCapitalize="none"
          autoCorrect={false}
          accessibilityLabel="Identifiant du modèle VRM"
        />
        <Text style={styles.error}>{idError}</Text>

        <Text style={[styles.label, styles.fieldGap]}>Nom de fichier</Text>
        <TextInput
          style={styles.input}
          value={modelRef.fileName}
          onChangeText={(text) => updateAvatar({ modelRef: { ...modelRef, fileName: text } })}
          onEndEditing={() => commitFileName(modelRef.fileName)}
          placeholder="lobsterEdit.vrm"
          placeholderTextColor="#9ca3af"
          autoCapitalize="none"
          autoCorrect={false}
          accessibilityLabel="Nom de fichier du modèle VRM"
        />
        <Text style={styles.error}>{fileNameError}</Text>

        <Text style={styles.note}>
          Sélectionner un VRM du catalogue le télécharge depuis le Desktop
          vers ce téléphone pour le preview — le binaire prévaut sur le
          modèle intégré et remplace le résident précédent (un seul à la
          fois). L'envoi au Desktop reste une référence{' '}
          {'{id, fileName, hash}'}, jamais le binaire (D2).
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: '#ffffff',
  },
  content: {
    padding: 24,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: '#374151',
    marginBottom: 8,
  },
  fieldGap: {
    marginTop: 24,
  },
  card: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    backgroundColor: '#f9fafb',
    padding: 16,
    gap: 4,
  },
  cardSelected: {
    borderColor: '#2563eb',
    backgroundColor: '#eff6ff',
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#111827',
  },
  cardText: {
    fontSize: 14,
    color: '#4b5563',
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
  },
  error: {
    fontSize: 13,
    color: '#dc2626',
    marginTop: 6,
  },
  retry: {
    color: '#dc2626',
    fontWeight: '600',
    textDecorationLine: 'underline',
  },
  progressTrack: {
    marginTop: 8,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#e5e7eb',
    overflow: 'hidden',
  },
  progressFill: {
    height: 6,
    borderRadius: 3,
    backgroundColor: '#2563eb',
  },
  note: {
    marginTop: 32,
    fontSize: 13,
    lineHeight: 20,
    color: '#9ca3af',
  },
});

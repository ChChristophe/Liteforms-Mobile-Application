import { useEffect, useState } from 'react';
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
import type { VrmSummary } from '../../types/device';

/**
 * Ecran de selection du modele VRM (Phase 3 etape 5, decision D2 ajustee).
 *
 * Etat actuel : si un Desktop est connecte (connectionStore), la
 * bibliothèque reelle `GET /api/poc/vrms` (Phase C) est affichee et
 * selectionnable ; sinon la reference `{id, fileName, hash}` reste editable
 * a la main (fallback hors ligne, POC utilisable sans Desktop).
 *
 * Comportement final voulu (D2 ajustee, reporte) : selection dans le
 * catalogue du Desktop puis telechargement Desktop -> Mobile ; le VRM
 * telecharge remplace celui en place (un seul VRM resident sur le
 * telephone, contrainte de stockage).
 *
 * Champs :
 * - `id` : identifiant stable dans le catalogue Desktop (obligatoire) ;
 * - `fileName` : nom de fichier a des fins d'affichage (obligatoire) ;
 * - `hash` : lecture seule pour l'instant, servi par le contrat Desktop
 *   (D2/D4) ; `null` tant que le protocole ne l'exige pas.
 *
 * Validation : modelRef vide est refuse par `validateDeviceConfig`,
 * donc la persistance saute tant qu'un des deux champs est vide —
 * l'utilisateur voit l'erreur de champ correspondante.
 *
 * Au demontage : le store conserve la derniere reference valide.
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

  /** Selection dans le catalogue : modelRef {id, fileName, hash: null} (D2). */
  function selectVrm(vrm: VrmSummary): void {
    setIdError(null);
    setFileNameError(null);
    updateAvatar({
      modelRef: { id: vrm.id, fileName: vrm.fileName, hash: null },
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
            const selected = vrm.fileName === modelRef.fileName;
            return (
              <Pressable
                key={vrm.id}
                style={[styles.card, selected && styles.cardSelected]}
                onPress={() => selectVrm(vrm)}
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
              </Pressable>
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
          Pour l'instant, seule la référence est éditable ici ; le modèle par
          défaut (lobsterEdit.vrm) est intégré à l'application pour le
          preview. Comportement visé (D2, reporté) : sélectionner un VRM du
          catalogue du Desktop et le télécharger depuis le poste — le VRM
          téléchargé remplacera celui en place, un seul résident à la fois
          sur le téléphone.
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
  note: {
    marginTop: 32,
    fontSize: 13,
    lineHeight: 20,
    color: '#9ca3af',
  },
});

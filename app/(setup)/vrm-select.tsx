import { useState } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useConfigStore } from '../../stores/configStore';

/**
 * Ecran de selection du modele VRM (Phase 3 etape 5, decision D2 ajustee).
 *
 * Etat actuel : la reference `{id, fileName, hash}` est editable a la main ;
 * le modele par defaut `lobsterEdit.vrm` est presente en bundle pour le
 * preview. Aucun binaire n'est gere par cet ecran aujourd'hui.
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
export default function VrmSelectScreen() {
  const modelRef = useConfigStore((state) => state.config.avatar.modelRef);
  const updateAvatar = useConfigStore((state) => state.updateAvatar);

  const [idError, setIdError] = useState<string | null>(null);
  const [fileNameError, setFileNameError] = useState<string | null>(null);

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
      <View style={styles.content}>
        <Text style={styles.label}>Modèle actuel</Text>
        <View style={styles.card}>
          <Text style={styles.cardTitle}>{modelRef.fileName}</Text>
          <Text style={styles.cardText}>id : {modelRef.id}</Text>
          <Text style={styles.cardText}>
            hash : {modelRef.hash ?? 'non calculé (contrat Desktop)'}
          </Text>
        </View>

        <Text style={styles.label}>Identifiant de catalogue (id)</Text>
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
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: '#ffffff',
  },
  content: {
    flex: 1,
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

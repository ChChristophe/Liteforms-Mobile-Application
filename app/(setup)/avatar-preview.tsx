import { StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useConfigStore } from '../../stores/configStore';

/**
 * Stub de preview avatar (Phase 1) lie au store (Phase 3).
 *
 * Route native hors reseau qui tient la place du rendu GL/VRM reel prevu en
 * Phase 4 (GLView -> renderer expo-gl -> GLTFLoader + VRMLoaderPlugin ->
 * mixer VRMA, cf. PLAN.md). En attendant, elle reflete l'etat courant du
 * store (mood, couleur d'alcove, reference modele) pour verifier le lien
 * configuration -> preview. Les etats loading / error / retry / ready et le
 * rendu 3D sont livres avec le critere de succes de la Phase 4.
 *
 * Au demontage : sans effet de bord ; aucun contexte GL n'est possede.
 */
export default function AvatarPreviewScreen() {
  const mood = useConfigStore((state) => state.config.avatar.mood);
  const modelRef = useConfigStore((state) => state.config.avatar.modelRef);
  const alcoveColor = useConfigStore((state) => state.config.environment.alcoveColor);

  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      <View style={styles.placeholder}>
        <View style={[styles.alcove, { backgroundColor: alcoveColor ?? '#f3f4f6' }]}>
          <Text style={styles.alcoveModel}>{modelRef.fileName}</Text>
        </View>
        <View style={styles.statusCard}>
          <Text style={styles.statusTitle}>Configuration actuelle</Text>
          <Text style={styles.statusText}>
            Mood : {mood ?? 'défaut (Desktop)'}
          </Text>
          <Text style={styles.statusText}>
            Alcove : {alcoveColor ?? 'défaut (Desktop)'}
          </Text>
          <Text style={styles.statusNote}>
            Stub Phase 1 — le rendu natif VRM (GLView + Three.js) arrive en
            Phase 4 avec ses états loading, error, retry et ready.
          </Text>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: '#ffffff',
  },
  placeholder: {
    flex: 1,
    padding: 24,
    gap: 16,
  },
  alcove: {
    flex: 1,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'flex-end',
    paddingBottom: 32,
  },
  alcoveModel: {
    fontSize: 14,
    color: '#9ca3af',
  },
  statusCard: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    backgroundColor: '#f9fafb',
    padding: 16,
    gap: 4,
  },
  statusTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: '#111827',
    marginBottom: 4,
  },
  statusText: {
    fontSize: 14,
    color: '#4b5563',
  },
  statusNote: {
    marginTop: 8,
    fontSize: 12,
    lineHeight: 18,
    color: '#9ca3af',
  },
});

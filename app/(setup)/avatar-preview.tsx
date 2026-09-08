import { StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

/**
 * Stub de preview avatar (Phase 1).
 *
 * Route native hors reseau qui tient la place du rendu GL/VRM reel prevu en
 * Phase 4 (GLView -> renderer expo-gl -> GLTFLoader + VRMLoaderPlugin ->
 * mixer VRMA, cf. PLAN.md). Les etats loading / error / retry / ready et le
 * rendu 3D sont livres avec le critere de succes de la Phase 4 ; ce stub ne
 * simule aucun chargement.
 *
 * Au demontage : sans effet de bord ; aucun contexte GL n'est possede.
 */
export default function AvatarPreviewScreen() {
  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      <View style={styles.placeholder}>
        <Text style={styles.placeholderTitle}>Preview avatar</Text>
        <Text style={styles.placeholderText}>
          Stub Phase 1 — le rendu natif VRM (GLView + Three.js) arrive en
          Phase 4 avec ses états loading, error, retry et ready.
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
  placeholder: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  placeholderTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: '#111827',
  },
  placeholderText: {
    marginTop: 12,
    fontSize: 15,
    lineHeight: 22,
    textAlign: 'center',
    color: '#6b7280',
  },
});

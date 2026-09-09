import {
  Dimensions,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AvatarPreview } from '../../components/avatar/AvatarPreview';

/**
 * Ecran de preview avatar (Phase 4).
 *
 * Monte le composant de rendu natif `AvatarPreview` (GLView + three.js).
 * Le remontage reel du modele suit naturellement le remontage par cle du
 * GLView quand `modelRef.id` change. Une carte rappelle la configuration
 * courante (mood, couleur, modele) le temps du reglage du cadrage.
 *
 * Au demontage : le composant GL arrete sa boucle RAF et libere ses
 * ressources ; aucun contexte GL possede par cet ecran.
 */
export default function AvatarPreviewScreen() {
  const viewportHeight = Dimensions.get('window').height;

  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      <View style={[styles.preview, { height: viewportHeight * 0.55 }]}>
        <AvatarPreview />
      </View>
      <View style={styles.statusCard}>
        <Text style={styles.statusText}>
          Le preview 3D natif charge le modele bundle avec son animation idle.
          Le tint/mood et le cadrage restent reglables (sous-phases 4.4-4.5).
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
  preview: {
    overflow: 'hidden',
    borderTopLeftRadius: 0,
    borderTopRightRadius: 0,
  },
  statusCard: {
    flex: 1,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    backgroundColor: '#f9fafb',
    padding: 16,
    margin: 24,
  },
  statusText: {
    fontSize: 13,
    lineHeight: 20,
    color: '#6b7280',
  },
});

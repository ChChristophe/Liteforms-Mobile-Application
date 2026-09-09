import { StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AvatarPreview } from '../../components/avatar/AvatarPreview';

/**
 * Ecran de preview avatar (Phase 4).
 *
 * Monte le composant de rendu natif `AvatarPreview` (GLView + three.js) en
 * pleine hauteur : la scene occupe tout l'ecran, les reglages (zoom,
 * profondeur) tiennent en bandeau bas dans le composant. Le remontage reel
 * du modele suit le remontage par cle du GLView quand `modelRef.id` change.
 *
 * Au demontage : le composant GL arrete sa boucle RAF et libere ses
 * ressources ; aucun contexte GL possede par cet ecran.
 */
export default function AvatarPreviewScreen() {
  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      <AvatarPreview />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: '#0b1120',
  },
});

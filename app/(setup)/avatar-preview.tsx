import { ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AvatarPreview } from '../../components/avatar/AvatarPreview';
import { MoodChips } from '../../components/setup/MoodChips';
import { useConfigStore } from '../../stores/configStore';

/**
 * Ecran de preview avatar (Phase 4).
 *
 * Monte le composant de rendu natif `AvatarPreview` (GLView + three.js) en
 * pleine hauteur : la scene occupe tout l'ecran, les reglages (zoom,
 * profondeur) tiennent en bandeau bas dans le composant. Le remontage reel
 * du modele suit le remontage par cle du GLView quand `modelRef.id` change.
 *
 * Bandeau mood (dec. 15/09) : les chips d'humeur vivent SUR l'ecran de
 * preview, sous les reglages de pose, en variante sombre. Un appui ecrit
 * `config.avatar.mood` dans le store ; l'effet `[mood]` de `AvatarPreview`
 * applique alors `setMood` sur le runtime courant — l'expression change
 * dans la seconde, sans recharger le VRM ni remonter le GLView.
 *
 * Hauteur : ligne composee de la colonne flex 1 (`AvatarPreview`) plus un
 * bandeau de chips haut d'au plus deux lignes — aucun debordement possible
 * (pas de contenu scrollable ici ; regle lecon 2.7 verifiee : l'ecran
 * Ambiance, lui, reste en ScrollView).
 *
 * Au demontage : le composant GL arrete sa boucle RAF et libere ses
 * ressources ; aucun contexte GL possede par cet ecran.
 */
export default function AvatarPreviewScreen() {
  const updateAvatar = useConfigStore((state) => state.updateAvatar);
  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      <AvatarPreview />
      <View style={styles.moodBanner}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.moodScrollContent}
        >
          <MoodChips
            variant="dark"
            onMoodSelect={(mood) => updateAvatar({ mood })}
          />
        </ScrollView>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: '#0b1120',
  },
  moodBanner: {
    // Hauteur FIXE (une rangée) : si le bandeau wrap a 2 lignes, le GLView
    // (flex:1) changeait de hauteur et l'aspect de la camera variait
    // (« l'alcove change de resolution »). Une seule rangée scrollable
    // horizontalement = hauteur stable, GLView stable, cadrage stable.
    height: 56,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#1f2937',
  },
  moodScrollContent: {
    paddingVertical: 6,
    paddingHorizontal: 12,
  },
});

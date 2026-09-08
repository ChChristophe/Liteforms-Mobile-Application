import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import ColorPicker, { HueSlider, Panel1, Preview } from 'reanimated-color-picker';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { ColorFormatsObject } from 'reanimated-color-picker/lib/typescript/types';
import { AVATAR_MOODS, type AvatarMood } from '../../types/config';
import { useConfigStore } from '../../stores/configStore';

/** Libelles affiches des humeurs (valeurs de contrat en anglais). */
const MOOD_LABELS: Record<AvatarMood, string> = {
  happy: 'Joyeux',
  sad: 'Triste',
  angry: 'En colère',
  surprised: 'Surpris',
  relaxed: 'Détendu',
};

/** Meme regle que la validation du domaine : #rrggbb minuscule strict. */
const HEX_COLOR_PATTERN = /^#[0-9a-f]{6}$/;

/**
 * Ecran d'ambiance : humeur du preview et couleur de l'alcove.
 *
 * Comportement :
 * - mood : selection par chips ; "Defaut" ecrit `null` (valeur de contrat,
 *   le Desktop choisit) ;
 * - couleur : carré dégradé saturation/luminosité + barre de teinte
 *   (`reanimated-color-picker`, gestes natifs via reanimated/gesture-handler
 *   deja fournis par Expo) ; le hex est normalise minuscule et valide contre
 *   le contrat avant ecriture dans le store ;
 * - "Couleur par defaut du Desktop" ecrit `null`.
 *
 * Etats locaux : aucun — le picker gere son propre etat de geste et le store
 * recoit la couleur validee a chaque relachement (`onComplete`).
 *
 * Au demontage : rien a nettoyer ; GestureHandlerRootView est local a
 * l'ecran et disparait avec lui.
 */
export default function EnvironmentScreen() {
  const environment = useConfigStore((state) => state.config.environment);
  const avatarMood = useConfigStore((state) => state.config.avatar.mood);
  const updateEnvironment = useConfigStore((state) => state.updateEnvironment);
  const updateAvatar = useConfigStore((state) => state.updateAvatar);

/**
 * Normalise et commite le resultat du picker. Le hex peut inclure un canal
 * alpha selon le format interne : on borne au contrat `#rrggbb` ; toute
 * valeur hors contrat est ignoree (defense a la frontiere du store).
 *
 * RNA (reanimated v4) : cette fonction est branchée sur `onCompleteJS` —
 * la prop `onComplete` s'exécute sur le thread UI (worklet) et appeler
 * Zustand/React depuis là crash nativement l'app au premier geste.
 */
function onColorCompleteJS(colors: ColorFormatsObject): void {
  const hex = colors.hex.toLowerCase().slice(0, 7);
  if (HEX_COLOR_PATTERN.test(hex)) {
    updateEnvironment({ alcoveColor: hex });
  }
}

  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.label}>Humeur du preview</Text>
        <View style={styles.chipWrap}>
          <Pressable
            style={[styles.chip, avatarMood === null && styles.chipSelected]}
            accessibilityRole="button"
            accessibilityState={{ selected: avatarMood === null }}
            onPress={() => updateAvatar({ mood: null })}
          >
            <Text style={[styles.chipText, avatarMood === null && styles.chipTextSelected]}>
              Défaut
            </Text>
          </Pressable>
          {AVATAR_MOODS.map((mood) => {
            const selected = avatarMood === mood;
            return (
              <Pressable
                key={mood}
                style={[styles.chip, selected && styles.chipSelected]}
                accessibilityRole="button"
                accessibilityState={{ selected }}
                onPress={() => updateAvatar({ mood })}
              >
                <Text style={[styles.chipText, selected && styles.chipTextSelected]}>
                  {MOOD_LABELS[mood]}
                </Text>
              </Pressable>
            );
          })}
        </View>

        <Text style={styles.label}>Couleur de l'alcove</Text>
        <GestureHandlerRootView style={styles.pickerRoot}>
          <ColorPicker
            value={environment.alcoveColor ?? '#4a90d9'}
            onCompleteJS={onColorCompleteJS}
            thumbSize={32}
            sliderThickness={22}
          >
            <Panel1 style={styles.panel} />
            <HueSlider style={styles.slider} />
            <Preview style={styles.preview} />
          </ColorPicker>
        </GestureHandlerRootView>
        <Pressable
          style={[styles.chip, styles.defaultChip, environment.alcoveColor === null && styles.chipSelected]}
          accessibilityRole="button"
          accessibilityState={{ selected: environment.alcoveColor === null }}
          onPress={() => updateEnvironment({ alcoveColor: null })}
        >
          <Text style={[styles.chipText, environment.alcoveColor === null && styles.chipTextSelected]}>
            Couleur par défaut du Desktop
          </Text>
        </Pressable>
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
    paddingBottom: 48,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: '#374151',
    marginBottom: 10,
  },
  chipWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 28,
  },
  chip: {
    minHeight: 44,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#d1d5db',
    backgroundColor: '#f9fafb',
    paddingHorizontal: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chipSelected: {
    borderColor: '#4a90d9',
    backgroundColor: '#e8f2fc',
  },
  chipText: {
    fontSize: 15,
    color: '#4b5563',
  },
  chipTextSelected: {
    color: '#1d4ed8',
    fontWeight: '600',
  },
  defaultChip: {
    alignSelf: 'flex-start',
    marginTop: 20,
  },
  pickerRoot: {
    borderRadius: 14,
  },
  panel: {
    height: 220,
    borderRadius: 14,
  },
  slider: {
    marginTop: 16,
    borderRadius: 12,
  },
  preview: {
    marginTop: 16,
    height: 48,
    borderRadius: 12,
  },
});

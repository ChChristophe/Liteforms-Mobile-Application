import { Pressable, StyleSheet, Text, View } from 'react-native';
import { AVATAR_MOODS, type AvatarMood } from '../../types/config';
import { useConfigStore } from '../../stores/configStore';

/** Libelles affiches des humeurs (valeurs de contrat en anglais). */
export const MOOD_LABELS: Record<AvatarMood, string> = {
  happy: 'Joyeux',
  sad: 'Triste',
  angry: 'En colère',
  surprised: 'Surpris',
  relaxed: 'Détendu',
};

/** Variante visuelle des chips : fond clair (ecrans setup) ou sombre (preview). */
export type MoodChipVariant = 'light' | 'dark';

/** Profil d'un chip tel que rendu : cible, label, etat de selection. */
export type MoodChipDef = {
  /** Valeur ecrite dans `config.avatar.mood` ; `null` = humeur defaut du Desktop. */
  value: AvatarMood | null;
  /** Label affiche (« Defaut » pour la valeur nulle). */
  label: string;
  /** Vrai si ce chip correspond a l'humeur courante du store. */
  selected: boolean;
};

/**
 * Logique pure de la ligne de chips : « Defaut » toujours premier
 * (selection ssi humeur nulle), puis les humeurs du contrat (ordre
 * `AVATAR_MOODS`, stable pour l'UI). Extraite du JSX pour etre testable
 * hors rendu natif (meme regle que les suites vitest pures du repo).
 */
export function moodChipDefs(current: AvatarMood | null): MoodChipDef[] {
  return [
    { value: null, label: 'Défaut', selected: current === null },
    ...AVATAR_MOODS.map((mood) => ({
      value: mood,
      label: MOOD_LABELS[mood],
      selected: current === mood,
    })),
  ];
}

/**
 * Palettes par variante : memes formes (chips de base) avec couleurs
 * adaptees — `light` reproduit le style historique de l'ecran Ambiance
 * (fond blanc), `dark` s'accorde au fond `#0b1120` du preview.
 */
const PALETTES: Record<
  MoodChipVariant,
  {
    chip: {
      borderColor: string;
      backgroundColor: string;
    };
    chipSelected: {
      borderColor: string;
      backgroundColor: string;
    };
    chipText: {
      color: string;
    };
    chipTextSelected: {
      color: string;
    };
  }
> = {
  light: {
    chip: { borderColor: '#d1d5db', backgroundColor: '#f9fafb' },
    chipSelected: { borderColor: '#4a90d9', backgroundColor: '#e8f2fc' },
    chipText: { color: '#4b5563' },
    chipTextSelected: { color: '#1d4ed8' },
  },
  dark: {
    chip: { borderColor: '#334155', backgroundColor: '#1e293b' },
    chipSelected: { borderColor: '#4a90d9', backgroundColor: '#1e3a5f' },
    chipText: { color: '#cbd5e1' },
    chipTextSelected: { color: '#93c5fd' },
  },
};

/**
 * Chips de selection de l'humeur du preview (`config.avatar.mood`).
 *
 * Comportement :
 * - auto-branche sur le store (re-rendu uniquement quand l'humeur change) ;
 *   l'ecran qui l'utilise n'a aucun etat local ;
 * - « Defaut » ecrit `null` (valeur de contrat, le Desktop choisit) ;
 * - aucun etat local ni persiste ici : le store est la seule source.
 *
 * Props :
 * - `variant` : `light` (par defaut, ecrans setup fond blanc) ou `dark`
 *   (bandeau du preview, fond `#0b1120`) ;
 * - `onMoodSelect` : appele avec la nouvelle valeur ; l'appelant decide de
 *   l'ecriture au store (pour l'instant toujours `updateAvatar({ mood })`).
 */
export function MoodChips({
  variant = 'light',
  onMoodSelect,
}: {
  /** Variante visuelle, cf. types admissibles de `MoodChipVariant`. */
  variant?: MoodChipVariant;
  /** Callback d'appui : nouvelle humeur ou `null` (Defaut). */
  onMoodSelect: (mood: AvatarMood | null) => void;
}) {
  const current = useConfigStore((state) => state.config.avatar.mood);
  const palette = PALETTES[variant];
  return (
    <View style={styles.chipWrap}>
      {moodChipDefs(current).map((chip) => (
        <Pressable
          key={chip.label}
          style={[
            styles.chip,
            palette.chip,
            chip.selected && palette.chipSelected,
          ]}
          accessibilityRole="button"
          accessibilityState={{ selected: chip.selected }}
          onPress={() => onMoodSelect(chip.value)}
        >
          <Text
            style={[
              styles.chipText,
              palette.chipText,
              chip.selected && palette.chipTextSelected,
            ]}
          >
            {chip.label}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  chipWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  chip: {
    minHeight: 44,
    borderRadius: 20,
    borderWidth: 1,
    paddingHorizontal: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chipSelected: {},
  chipText: {
    fontSize: 15,
  },
  chipTextSelected: {
    fontWeight: '600',
  },
});

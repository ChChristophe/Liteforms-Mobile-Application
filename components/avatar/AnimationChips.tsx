import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import {
  ANIMATION_CATALOG,
  type AnimationCatalogEntry,
} from '../../lib/animations/catalog';

/**
 * Chips de selection d'animation du preview (apercu local).
 *
 * Composant PRESENTATIONNEL : l'ecran gere le telechargement/la lecture et
 * passe l'etat courant. Style aligne sur les chips d'humeur en variante
 * sombre (bandeau sur fond `#0b1120`).
 *
 * Props :
 * - `selectedFileName` : animation actuellement jouee (met en surbrillance) ;
 * - `busyFileName` : animation en cours de chargement/telechargement (spinner,
 *   tous les autres chips desactives pour eviter les lectures concurrentes) ;
 * - `onSelect` : appui ; l'appelant decide lecture bundle, cache ou download.
 */
export function AnimationChips({
  selectedFileName,
  busyFileName,
  onSelect,
}: {
  /** Nom de fichier de l'animation jouee, ou `null`. */
  selectedFileName: string | null;
  /** Nom de fichier en cours de chargement, ou `null`. */
  busyFileName: string | null;
  /** Callback d'appui avec l'entree complete du catalogue. */
  onSelect: (entry: AnimationCatalogEntry) => void;
}) {
  return (
    <View style={styles.chipWrap}>
      {ANIMATION_CATALOG.map((entry) => {
        const selected = entry.fileName === selectedFileName;
        const busy = entry.fileName === busyFileName;
        return (
          <Pressable
            key={entry.fileName}
            style={[styles.chip, selected && styles.chipSelected]}
            disabled={busyFileName !== null}
            accessibilityRole="button"
            accessibilityState={{ selected, busy }}
            accessibilityLabel={`Jouer l'animation ${entry.label}`}
            onPress={() => onSelect(entry)}
          >
            {busy ? (
              <ActivityIndicator size="small" color="#93c5fd" />
            ) : (
              <Text
                style={[styles.chipText, selected && styles.chipTextSelected]}
              >
                {entry.label}
              </Text>
            )}
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  chipWrap: {
    flexDirection: 'row',
    gap: 8,
  },
  chip: {
    minHeight: 44,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#334155',
    backgroundColor: '#1e293b',
    paddingHorizontal: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chipSelected: {
    borderColor: '#4a90d9',
    backgroundColor: '#1e3a5f',
  },
  chipText: {
    fontSize: 15,
    color: '#cbd5e1',
  },
  chipTextSelected: {
    fontWeight: '600',
    color: '#93c5fd',
  },
});

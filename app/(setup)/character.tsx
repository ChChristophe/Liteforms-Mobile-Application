import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  CHARACTER_NAME_MAX_LENGTH,
  GREETING_MAX_LENGTH,
  PERSONALITY_MAX_LENGTH,
  PRONOUNS,
  type Pronouns,
} from '../../types/config';
import { useConfigStore } from '../../stores/configStore';

/** Libelles affiches des pronoms (valeurs de contrat en majuscules). */
const PRONOUN_LABELS: Record<Pronouns, string> = {
  HE: 'Il / Lui',
  SHE: 'Elle',
  THEY: 'Iel',
};

/**
 * Ecran d'identite de l'avatar : nom, pronoms, personnalite, greeting.
 *
 * Comportement :
 * - chaque champ ecrit directement dans `configStore` (source de verite
 *   unique) ; la persistance AsyncStorage suit chaque mutation ;
 * - les limites du contrat sont appliquees par `maxLength` et affichees par
 *   compteurs ;
 * - le nom est requis (erreur de champ affichee si vide apres trim) ;
 *   personnalite et greeting sont optionnels.
 *
 * States : le store n'est pas encore hydrate au premier rendu possible ;
 * les valeurs affichees sont alors les defauts et seront remplacees par
 * l'hydratation (ecran simple, aucun etat loading propre requis).
 *
 * Au demontage : rien a nettoyer ; les saisies restent dans le store.
 */
export default function CharacterScreen() {
  const character = useConfigStore((state) => state.config.character);
  const updateCharacter = useConfigStore((state) => state.updateCharacter);

  const nameError = character.name.trim().length === 0 ? 'Le nom est requis.' : null;

  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <Text style={styles.label}>Nom</Text>
          <TextInput
            style={styles.input}
            value={character.name}
            onChangeText={(text) => updateCharacter({ name: text })}
            maxLength={CHARACTER_NAME_MAX_LENGTH}
            placeholder="Clawdia"
            placeholderTextColor="#9ca3af"
            autoCorrect={false}
            accessibilityLabel="Nom de l'avatar"
          />
          <View style={styles.hintRow}>
            <Text style={styles.error}>{nameError}</Text>
            <Text style={styles.counter}>
              {character.name.length}/{CHARACTER_NAME_MAX_LENGTH}
            </Text>
          </View>

          <Text style={styles.label}>Pronoms</Text>
          <View style={styles.segmentRow}>
            {PRONOUNS.map((pronoun) => {
              const selected = character.pronouns === pronoun;
              return (
                <Pressable
                  key={pronoun}
                  style={[styles.segment, selected && styles.segmentSelected]}
                  accessibilityRole="button"
                  accessibilityState={{ selected }}
                  onPress={() => updateCharacter({ pronouns: pronoun })}
                >
                  <Text style={[styles.segmentText, selected && styles.segmentTextSelected]}>
                    {PRONOUN_LABELS[pronoun]}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          <Text style={styles.label}>Personnalité</Text>
          <TextInput
            style={[styles.input, styles.textarea]}
            value={character.personality}
            onChangeText={(text) => updateCharacter({ personality: text })}
            maxLength={PERSONALITY_MAX_LENGTH}
            multiline
            placeholder="Comment l'avatar doit-il se comporter ?"
            placeholderTextColor="#9ca3af"
            accessibilityLabel="Personnalité de l'avatar"
          />
          <View style={styles.hintRow}>
            <Text style={styles.counter}>
              {character.personality.length}/{PERSONALITY_MAX_LENGTH}
            </Text>
          </View>

          <Text style={styles.label}>Phrase d'accueil</Text>
          <TextInput
            style={[styles.input, styles.textarea]}
            value={character.greeting}
            onChangeText={(text) => updateCharacter({ greeting: text })}
            maxLength={GREETING_MAX_LENGTH}
            multiline
            placeholder="Première phrase prononcée par l'avatar"
            placeholderTextColor="#9ca3af"
            accessibilityLabel="Phrase d'accueil de l'avatar"
          />
          <View style={styles.hintRow}>
            <Text style={styles.counter}>
              {character.greeting.length}/{GREETING_MAX_LENGTH}
            </Text>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: '#ffffff',
  },
  flex: {
    flex: 1,
  },
  content: {
    padding: 24,
    paddingBottom: 48,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: '#374151',
    marginBottom: 8,
  },
  input: {
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    color: '#111827',
    backgroundColor: '#f9fafb',
  },
  textarea: {
    minHeight: 96,
    textAlignVertical: 'top',
  },
  hintRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 6,
    marginBottom: 20,
  },
  error: {
    fontSize: 13,
    color: '#dc2626',
  },
  counter: {
    fontSize: 13,
    color: '#9ca3af',
  },
  segmentRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 20,
  },
  segment: {
    flex: 1,
    minHeight: 44,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#d1d5db',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#f9fafb',
  },
  segmentSelected: {
    borderColor: '#4a90d9',
    backgroundColor: '#e8f2fc',
  },
  segmentText: {
    fontSize: 15,
    color: '#4b5563',
  },
  segmentTextSelected: {
    color: '#1d4ed8',
    fontWeight: '600',
  },
});

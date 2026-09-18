import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { WAKE_WORD_MODELS } from '../../lib/wakeword/catalog';
import { useConfigStore } from '../../stores/configStore';

/**
 * Ecran de selection du wake word (protocole `DEVICE_API.md`
 * §`POST /api/device-config`, bloc `wakeWord`, 18/09/2026).
 *
 * Regles :
 * - « Aucun » ecrit `null` (micro manuel) ; c'est le defaut « rien de
 *   pre-active » ;
 * - les quatre modeles sont ceux embarques par l'appliance ; le Mobile ne
 *   fait que transporter le choix (aucun appel API, aucun audio) ;
 * - l'appliance conserve sa selection locale mais le bloc `device-config`
 *   fait foi des sa reception (le smartphone est la source de verite).
 *
 * Aucun etat local : le store est la source unique, la persistance suit.
 */
export default function WakeWordScreen() {
  const selected = useConfigStore((state) => state.config.wakeWord.model);
  const updateWakeWord = useConfigStore((state) => state.updateWakeWord);

  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.label}>Wake word</Text>
        <Text style={styles.hint}>
          Détection 100 % locale à l'appliance. « Aucun » = micro manuel.
        </Text>
        <View style={styles.chipWrap}>
          <Pressable
            style={[styles.chip, selected === null && styles.chipSelected]}
            accessibilityRole="button"
            accessibilityState={{ selected: selected === null }}
            onPress={() => updateWakeWord({ model: null })}
          >
            <Text style={[styles.chipText, selected === null && styles.chipTextSelected]}>
              Aucun
            </Text>
          </Pressable>
          {WAKE_WORD_MODELS.map((entry) => {
            const isSelected = selected === entry.id;
            return (
              <Pressable
                key={entry.id}
                style={[styles.chip, isSelected && styles.chipSelected]}
                accessibilityRole="button"
                accessibilityState={{ selected: isSelected }}
                onPress={() => updateWakeWord({ model: entry.id })}
              >
                <Text style={[styles.chipText, isSelected && styles.chipTextSelected]}>
                  {entry.phrase}
                </Text>
              </Pressable>
            );
          })}
        </View>
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
  hint: {
    marginBottom: 16,
    fontSize: 13,
    lineHeight: 18,
    color: '#6b7280',
  },
  chipWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  chip: {
    minHeight: 44,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#d1d5db',
    backgroundColor: '#f9fafb',
    paddingHorizontal: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chipSelected: {
    borderColor: '#4a90d9',
    backgroundColor: '#e8f2fc',
  },
  chipText: {
    fontSize: 14,
    color: '#4b5563',
  },
  chipTextSelected: {
    color: '#1d4ed8',
    fontWeight: '600',
  },
});

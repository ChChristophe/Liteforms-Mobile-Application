import { useEffect, useState } from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import ColorPicker, { HueSlider, Panel1, Preview } from 'reanimated-color-picker';
import type { ColorFormatsObject } from 'reanimated-color-picker/lib/typescript/types';
import Slider from '@react-native-community/slider';
import { SafeAreaView } from 'react-native-safe-area-context';
import { WAKE_WORD_MODELS } from '../../lib/wakeword/catalog';
import {
  WAKE_WORD_CUE_DEFAULT_DURATION_MS,
  WAKE_WORD_CUE_FLASH_COLOR,
  WAKE_WORD_CUE_MAX_DURATION_MS,
  WAKE_WORD_CUE_MIN_DURATION_MS,
} from '../../types/config';
import { useConfigStore } from '../../stores/configStore';

/** Meme regle que la validation du domaine : #rrggbb minuscule strict. */
const HEX_COLOR_PATTERN = /^#[0-9a-f]{6}$/;

/** Pas du slider de duree, en millisecondes (reference Web). */
const CUE_SLIDER_STEP_MS = 100;

/** Formate une duree en secondes, a la francaise (reference Web). */
function formatSeconds(ms: number): string {
  return `${(ms / 1000).toFixed(1).replace('.', ',')} s`;
}

/**
 * Ecran de selection du wake word et de sa confirmation visuelle (protocole
 * `DEVICE_API.md` §`POST /api/device-config`, bloc `wakeWord`, 18/09/2026).
 *
 * Regles :
 * - « Aucun » ecrit `null` (micro manuel) ; c'est le defaut « rien de
 *   pre-active » ;
 * - les quatre modeles sont ceux embarques par l'appliance ; le Mobile ne
 *   fait que transporter le choix (aucun appel API, aucun audio) ;
 * - quand un modele est selectionne, deux reglages de cue (couleur du flash,
 *   duree du clignotement) sont proposes ; chacun a un bouton Reset vers son
 *   defaut. L'ANIMATION de detection n'est PAS choisie ici : elle l'est
 *   uniquement dans l'aperçu de l'avatar (`/avatar-preview`), qui persiste
 *   `wakeWord.cue.animationUrl` ;
 * - l'appliance conserve sa selection locale mais le bloc `device-config`
 *   fait foi des sa reception (le smartphone est la source de verite).
 *
 * Etats locaux : seul `blinkDisplay` (miroir du slider pendant le drag). Le
 * store reste la source de verite, la persistance suit chaque commit.
 */
export default function WakeWordScreen() {
  const selected = useConfigStore((state) => state.config.wakeWord.model);
  const cue = useConfigStore((state) => state.config.wakeWord.cue);
  const updateWakeWord = useConfigStore((state) => state.updateWakeWord);
  const updateWakeWordCue = useConfigStore((state) => state.updateWakeWordCue);

  // Miroir d'affichage du slider : suit le store (reset, hydratation) pendant
  // que le drag garde la valeur locale. Le commit n'a lieu qu'au relachement.
  const [blinkDisplay, setBlinkDisplay] = useState(cue.blinkDurationMs);
  useEffect(() => {
    setBlinkDisplay(cue.blinkDurationMs);
  }, [cue.blinkDurationMs]);

  /**
   * Normalise et commite la couleur du flash. Le hex peut inclure un canal
   * alpha selon le format interne : on borne au contrat `#rrggbb` ; toute
   * valeur hors contrat est ignoree (defense a la frontiere du store).
   *
   * RNA (reanimated v4) : branche sur `onCompleteJS` — `onComplete` s'execute
   * sur le thread UI et appeler Zustand/React depuis la crash nativement
   * l'app au premier geste (meme choix que l'ecran environment).
   */
  function onFlashColorCompleteJS(colors: ColorFormatsObject): void {
    const hex = colors.hex.toLowerCase().slice(0, 7);
    if (HEX_COLOR_PATTERN.test(hex)) {
      updateWakeWordCue({ flashColor: hex });
    }
  }

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

        {selected !== null && (
          <>
            <View style={styles.cueBlock}>
              <View style={styles.cueTitleRow}>
                <Text style={styles.label}>Couleur du flash</Text>
                <View style={styles.colorValue}>
                  <View style={[styles.colorDot, { backgroundColor: cue.flashColor }]} />
                  <Text style={styles.hexText}>{cue.flashColor}</Text>
                </View>
                {cue.flashColor !== WAKE_WORD_CUE_FLASH_COLOR && (
                  <Pressable
                    style={styles.resetButton}
                    accessibilityRole="button"
                    accessibilityLabel="Réinitialiser la couleur du flash"
                    onPress={() =>
                      updateWakeWordCue({ flashColor: WAKE_WORD_CUE_FLASH_COLOR })
                    }
                  >
                    <Text style={styles.resetText}>Reset</Text>
                  </Pressable>
                )}
              </View>
              <GestureHandlerRootView style={styles.pickerRoot}>
                <ColorPicker
                  value={cue.flashColor}
                  onCompleteJS={onFlashColorCompleteJS}
                  thumbSize={32}
                  sliderThickness={22}
                >
                  <Panel1 style={styles.panel} />
                  <HueSlider style={styles.slider} />
                  <Preview style={styles.preview} hideText />
                </ColorPicker>
              </GestureHandlerRootView>
            </View>

            <View style={styles.cueBlock}>
              <View style={styles.cueTitleRow}>
                <Text style={styles.label}>
                  Durée du clignotement : {formatSeconds(blinkDisplay)}
                </Text>
                {cue.blinkDurationMs !== WAKE_WORD_CUE_DEFAULT_DURATION_MS && (
                  <Pressable
                    style={styles.resetButton}
                    accessibilityRole="button"
                    accessibilityLabel="Réinitialiser la durée du clignotement"
                    onPress={() =>
                      updateWakeWordCue({
                        blinkDurationMs: WAKE_WORD_CUE_DEFAULT_DURATION_MS,
                      })
                    }
                  >
                    <Text style={styles.resetText}>Reset</Text>
                  </Pressable>
                )}
              </View>
              <Slider
                style={styles.slider}
                minimumValue={WAKE_WORD_CUE_MIN_DURATION_MS}
                maximumValue={WAKE_WORD_CUE_MAX_DURATION_MS}
                step={CUE_SLIDER_STEP_MS}
                value={blinkDisplay}
                onValueChange={setBlinkDisplay}
                onSlidingComplete={(value) => {
                  setBlinkDisplay(value);
                  updateWakeWordCue({ blinkDurationMs: value });
                }}
                accessibilityLabel="Durée du clignotement du wake word"
                minimumTrackTintColor="#4a90d9"
                maximumTrackTintColor="#d1d5db"
              />
            </View>
          </>
        )}
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
  cueBlock: {
    marginTop: 28,
  },
  cueTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  colorValue: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flex: 1,
  },
  colorDot: {
    width: 18,
    height: 18,
    borderRadius: 5,
    borderWidth: 1,
    borderColor: '#d1d5db',
    marginLeft: 12,
  },
  hexText: {
    fontSize: 13,
    color: '#4b5563',
    fontVariant: ['tabular-nums'],
  },
  resetButton: {
    minHeight: 32,
    paddingHorizontal: 12,
    justifyContent: 'center',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#d1d5db',
  },
  resetText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#4b5563',
  },
  pickerRoot: {
    borderRadius: 14,
  },
  panel: {
    height: 180,
    borderRadius: 14,
  },
  slider: {
    marginTop: 4,
    borderRadius: 12,
  },
  preview: {
    marginTop: 12,
    height: 44,
    borderRadius: 12,
  },
});

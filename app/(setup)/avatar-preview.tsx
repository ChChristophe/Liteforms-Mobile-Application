import { useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  AvatarPreview,
  type AnimationRequest,
} from '../../components/avatar/AvatarPreview';
import { AnimationChips } from '../../components/avatar/AnimationChips';
import { MoodChips } from '../../components/setup/MoodChips';
import { useConfigStore } from '../../stores/configStore';
import { useConnectionStore } from '../../stores/connectionStore';
import {
  BUNDLED_ANIMATION_FILE_NAME,
  wakeWordCueAnimationUrlFor,
  type AnimationCatalogEntry,
} from '../../lib/animations/catalog';
import {
  getCachedAnimation,
  readAnimationBuffer,
} from '../../lib/storage/animationCache';
import { startAnimationDownload } from '../../lib/network/animationDownload';
import { loadBundledAssetBuffer } from '../../lib/avatar/nativeTextureSupport';

/**
 * Ecran de preview avatar (Phase 4) + apercu d'animation.
 *
 * Monte le composant de rendu natif `AvatarPreview` (GLView + three.js) en
 * pleine hauteur : la scene occupe l'essentiel de l'ecran, les reglages de
 * pose tiennent dans le composant, et deux bandeaux a hauteur FIXE portent
 * les chips d'humeur puis d'animation.
 *
 * Aperçu d'animation (SELECTION de la cue wake word) :
 * - un appui sur une chip joue l'animation sur le preview natif SANS
 *   remonter le GLView (`AvatarPreview.animationRequest` -> runtime a chaud) ;
 * - « Idle (default) » lit le bundle embarque (hors ligne) ; les autres sont
 *   telechargees depuis l'appliance (`GET /animations/<f>.vrma`) puis mises
 *   en cache FileSystem ; une animation deja en cache est relue sans reseau ;
 * - cet ecran est le SEUL endroit ou l'on choisit l'animation de detection :
 *   une animation non-idle est aussi persistee dans
 *   `config.wakeWord.cue.animationUrl` (via `updateWakeWordCue`) ; l'idle
 *   reste un aperçu local et ne change PAS la cue (pose de base, jamais une
 *   confirmation) ;
 * - Desktop non connecte / telechargement en echec : message local, le
 *   preview reste sur l'animation precedente, aucune persistance, jamais de
 *   crash.
 *
 * Bandeaux a hauteur fixe : `AvatarPreview` (flex 1) garde une hauteur
 * stable, donc une camera/aspect stable (lecon « alcove qui change de
 * resolution »).
 *
 * Au demontage : le composant GL arrete sa boucle RAF et libere ses
 * ressources ; aucun contexte GL possede par cet ecran.
 */
export default function AvatarPreviewScreen() {
  const updateAvatar = useConfigStore((state) => state.updateAvatar);
  const updateWakeWordCue = useConfigStore((state) => state.updateWakeWordCue);
  const host = useConnectionStore((state) => state.host);
  const port = useConnectionStore((state) => state.port);
  const connectedDesktop = useConnectionStore((state) => state.connectedDesktop);

  /** Animation actuellement jouee (surbrillance des chips). */
  const [selectedFileName, setSelectedFileName] = useState<string | null>(
    BUNDLED_ANIMATION_FILE_NAME
  );
  /** Demande transmise au preview ; un nouvel id relance la lecture. */
  const [animationRequest, setAnimationRequest] =
    useState<AnimationRequest | null>(null);
  /** Animation en cours de chargement/telechargement (chips desactivees). */
  const [busyFileName, setBusyFileName] = useState<string | null>(null);
  /** Fraction de telechargement (null = indetermine). */
  const [progress, setProgress] = useState<number | null>(null);
  /** Erreur locale affichable (jamais un crash). */
  const [error, setError] = useState<string | null>(null);
  const requestIdRef = useRef(0);

  /** Publie un buffer pret : nouveau signal monotone vers le preview. */
  function publishAnimation(buffer: ArrayBuffer): void {
    requestIdRef.current += 1;
    setAnimationRequest({ buffer, id: requestIdRef.current });
  }

  /**
   * Joue une animation : bundle hors ligne, cache local, ou telechargement
   * depuis l'appliance si absente du cache.
   */
  async function selectAnimation(entry: AnimationCatalogEntry): Promise<void> {
    if (busyFileName !== null) return;
    setError(null);
    setProgress(null);
    setBusyFileName(entry.fileName);
    // Persist the wake word cue animation immediately: the choice is valid even
    // if the local preview download fails (the appliance owns the assets).
    // Idle stays a local-only preview and never overwrites the cue.
    const cueAnimationUrl = wakeWordCueAnimationUrlFor(entry);
    if (cueAnimationUrl !== null) {
      updateWakeWordCue({ animationUrl: cueAnimationUrl });
    }
    try {
      let buffer: ArrayBuffer;
      if (entry.bundled) {
        buffer = await loadBundledAssetBuffer(
          require('../../assets/animations/idle_loop.vrma')
        );
      } else if (connectedDesktop === null || host === null || port === null) {
        setError('Desktop non connecté : téléchargement impossible.');
        return;
      } else {
        const cached = await getCachedAnimation(entry.fileName);
        if (cached !== null) {
          buffer = await readAnimationBuffer(cached.fileUri);
        } else {
          const result = await startAnimationDownload(
            host,
            port,
            entry.fileName,
            setProgress
          );
          if (!result.ok) {
            setError(result.error);
            return;
          }
          buffer = await readAnimationBuffer(result.fileUri);
        }
      }
      setSelectedFileName(entry.fileName);
      publishAnimation(buffer);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Animation illisible.');
    } finally {
      setBusyFileName(null);
      setProgress(null);
    }
  }

  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      <AvatarPreview
        animationRequest={animationRequest}
        onAnimationError={setError}
      />
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
      <View style={styles.animationBanner}>
        {error !== null ? (
          <Pressable
            onPress={() => setError(null)}
            accessibilityRole="button"
            accessibilityLabel="Masquer l'erreur d'animation"
          >
            <Text style={styles.error} numberOfLines={2}>
              {error} (appuyer pour masquer)
            </Text>
          </Pressable>
        ) : (
          <>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.animationScrollContent}
            >
              <AnimationChips
                selectedFileName={selectedFileName}
                busyFileName={busyFileName}
                onSelect={(entry) => void selectAnimation(entry)}
              />
            </ScrollView>
            {busyFileName !== null && (
              <Text style={styles.progressLabel}>
                {progress === null ? '…' : `${Math.round(progress * 100)} %`}
              </Text>
            )}
          </>
        )}
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
  animationBanner: {
    // Meme contrainte que le bandeau d'humeur : hauteur fixe, une rangée
    // scrollable horizontalement (le message d'erreur tient sur 2 lignes).
    height: 56,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#1f2937',
    justifyContent: 'center',
  },
  animationScrollContent: {
    paddingVertical: 6,
    paddingHorizontal: 12,
  },
  progressLabel: {
    position: 'absolute',
    right: 12,
    top: 0,
    bottom: 0,
    textAlignVertical: 'center',
    fontSize: 12,
    fontWeight: '600',
    color: '#93c5fd',
    fontVariant: ['tabular-nums'],
  },
  error: {
    paddingHorizontal: 12,
    fontSize: 12,
    lineHeight: 16,
    color: '#fca5a5',
  },
});

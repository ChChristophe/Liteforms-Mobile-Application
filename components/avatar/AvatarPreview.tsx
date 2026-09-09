import {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  ActivityIndicator,
  AppState,
  Pressable,
  StyleSheet,
  Text,
  View,
  type AppStateStatus,
} from 'react-native';
import { GLView, type ExpoWebGLRenderingContext } from 'expo-gl';
import Slider from '@react-native-community/slider';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { useConfigStore } from '../../stores/configStore';
import { DEFAULT_AVATAR_POSE } from '../../lib/config/defaults';
import {
  POSE_DEPTH_MAX,
  POSE_DEPTH_MIN,
  POSE_ZOOM_MAX,
  POSE_ZOOM_MIN,
} from '../../types/config';
import {
  installNativeTextureSupport,
  loadBundledAssetBuffer,
  purgeTextureCache,
} from '../../lib/avatar/nativeTextureSupport';
import { startPreviewRuntime, type PreviewHandle } from '../../lib/avatar/previewRuntime';

/** Etats UI du preview : statique, recycle l'ecran, jamais par frame. */
type PreviewStatus =
  | { kind: 'loading' }
  | { kind: 'ready' }
  | { kind: 'error'; message: string };

/**
 * Preview natif de l'avatar VRM (Phase 4.1-4.2).
 *
 * Pipeline : GLView.onContextCreate → runtime three.js (renderer, VRM,
 * alcove, VRMA) → boucle RAF promise au composant.
 *
 * Cycle de vie :
 * - la boucle RAF est arretee au unmount, sur background (AppState) et sur
 *   erreur fatale ; relancee au foreground si prete ;
 * - AUCUN setState par frame : la boucle met a jour uniquement le runtime ;
 * - le GLView est remonte par `key` quand le modele change (modelRef.id) ou
 *   au retry : la strategie de rechargement minimale demandee par la
 *   sous-phase 4.2 ;
 * - dispose() du runtime libere geometries, materiaux, textures, mixer et
 *   renderer ; le contexte GL est detruit a l'unmount du GLView.
 *
 * Au demontage : cancelAnimationFrame, dispose runtime, destroyContextAsync.
 */
export const AvatarPreview = memo(function AvatarPreview() {
  /** Cle de remontage : id du modele courant du store. */
  const modelRefId = useConfigStore((state) => state.config.avatar.modelRef.id);
  /** 4.4 : tint alcove et mood appliques au runtime SANS remontage du GLView. */
  const alcoveColor = useConfigStore(
    (state) => state.config.environment.alcoveColor
  );
  const mood = useConfigStore((state) => state.config.avatar.mood);
  /** Pose persistee (yaws, zoom, profondeur) : appliquee au runtime. */
  const pose = useConfigStore((state) => state.config.avatar.pose);
  const [retryCounter, setRetryCounter] = useState(0);
  const [status, setStatus] = useState<PreviewStatus>({ kind: 'loading' });

  /** Runtime courant ; nul tant que non charge, null apres dispose. */
  const runtimeRef = useRef<PreviewHandle | null>(null);
  const rafRef = useRef<number | null>(null);
  const lastFrameRef = useRef<number | null>(null);
  const appStateRef = useRef<AppStateStatus>(AppState.currentState);

  // Tint/mood : efface a chaque changement du store, et (re)applique apres
  // la creation du runtime dans loadScene (memes valeurs, getState).
  useEffect(() => {
    runtimeRef.current?.setAlcoveTint(alcoveColor);
    runtimeRef.current?.setMood(mood);
  }, [alcoveColor, mood]);

  // Pose (rotation, zoom, profondeur) : meme contrat. Idempotent (applyPose
  // est un set absolu) : le commit de fin de geste rejoue les memes valeurs.
  useEffect(() => {
    runtimeRef.current?.applyPose(pose);
  }, [pose]);

  // Miroirs d'affichage des sliders : suivent le store (pose persistee,
  // reset...) pendant que le drag alimente le runtime en direct.
  const [zoomDisplay, setZoomDisplay] = useState(pose.zoom);
  const [depthDisplay, setDepthDisplay] = useState(pose.depth);
  useEffect(() => {
    setZoomDisplay(pose.zoom);
    setDepthDisplay(pose.depth);
  }, [pose]);

  /**
   * Commite la pose courante du runtime dans le store (persistance
   * AsyncStorage immediate, futur envoi Electron avec DeviceConfig).
   * Un seul appel par geste (fin de geste), jamais par frame.
   */
  const commitPose = useCallback(() => {
    const runtime = runtimeRef.current;
    if (runtime === null) return;
    useConfigStore.getState().updateAvatar({ pose: runtime.getPose() });
  }, []);

  /**
   * Reset de la pose (rotations, zoom, profondeur) vers les defauts du
   * contrat. Passe par le store : l'effet `pose` rejoue `applyPose` sur le
   * runtime et les sliders se resynchronisent d'eux-memes.
   */
  const resetPose = useCallback(() => {
    useConfigStore.getState().updateAvatar({ pose: DEFAULT_AVATAR_POSE });
  }, []);

  const stopLoop = useCallback(() => {
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    lastFrameRef.current = null;
  }, []);

  /** Boucle RAF : delta calcule hors JSX, aucun setState par frame (4.1). */
  const startLoopIfReady = useCallback(() => {
    if (rafRef.current !== null || runtimeRef.current === null) return;
    lastFrameRef.current = null;
    const tick = () => {
      const runtime = runtimeRef.current;
      if (runtime === null) return;
      const now = Date.now();
      const last = lastFrameRef.current ?? now;
      lastFrameRef.current = now;
      runtime.frame(Math.min((now - last) / 1000, 0.1));
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
  }, []);

  // Background/foreground : on stoppe au bg, on relance au retour (4.1).
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (next) => {
      appStateRef.current = next;
      if (next === 'active') {
        startLoopIfReady();
      } else {
        stopLoop();
      }
    });
    return () => subscription.remove();
  }, [startLoopIfReady, stopLoop]);

  // Arret de la boucle au demontage (4.1) — dispose est gere par le GLView.
  useEffect(() => stopLoop, [stopLoop]);

  /** Chaine de chargement declenchee par onContextCreate. */
  const loadScene = useCallback(
    async (gl: ExpoWebGLRenderingContext, width: number, height: number) => {
      setStatus({ kind: 'loading' });
      const uninstallTextureSupport = installNativeTextureSupport();
      try {
        const [vrm, alcove, animation] = await Promise.all([
          loadBundledAssetBuffer(
            require('../../assets/models/lobsterEdit.vrm')
          ),
          loadBundledAssetBuffer(
            require('../../assets/models/Alcove.glb')
          ),
          loadBundledAssetBuffer(
            require('../../assets/animations/idle_loop.vrma')
          ),
        ]);
        const runtime = await startPreviewRuntime(gl, width, height, {
          vrm,
          alcove,
          animation,
        });
        runtimeRef.current = runtime;
        // Etat courant du store au moment de la creation (4.4 + pose) : un
        // changement arrive pendant le chargement n'est pas perdu.
        const { config } = useConfigStore.getState();
        runtime.setAlcoveTint(config.environment.alcoveColor);
        runtime.setMood(config.avatar.mood);
        runtime.applyPose(config.avatar.pose);
        if (appStateRef.current === 'active') {
          setStatus({ kind: 'ready' });
          startLoopIfReady();
        }
      } catch (error) {
        stopLoop();
        runtimeRef.current = null;
        setStatus({
          kind: 'error',
          message:
            error instanceof Error
              ? error.message
              : 'Erreur inconnue pendant le chargement du preview.',
        });
        if (__DEV__) console.warn('[AvatarPreview] load failed', error);
      } finally {
        uninstallTextureSupport();
      }
    },
    [startLoopIfReady, stopLoop]
  );

  /** Genre un nettoyage complet du runtime + contexte GL (gates 4.1). */
  const releaseAll = useCallback(() => {
    stopLoop();
    runtimeRef.current?.dispose();
    runtimeRef.current = null;
    const gl = glRef.current;
    if (gl !== null) {
      void GLView.destroyContextAsync(gl.contextId);
      glRef.current = null;
    }
    // Purge des fichiers textures du cache : sur, car tout render est arrete.
    void purgeTextureCache();
  }, [stopLoop]);

  const glRef = useRef<ExpoWebGLRenderingContext | null>(null);

  useEffect(() => releaseAll, [releaseAll]);

  /**
   * Geste 4.5 : pan horizontal. Cible decidee AU DEBUT du drag — point dans
   * la zone ecran de l'avatar (projection bbox, runtime) => rotation avatar,
   * sinon rotation alcove. Couche RN pure au-dessus du runtime : aucun
   * setState, la boucle 3D ne reconstruit rien.
   */
  const lastPanXRef = useRef(0);
  const viewSizeRef = useRef({ width: 0, height: 0 });
  const dragTargetRef = useRef<'avatar' | 'alcove'>('avatar');
  const singlePanGesture = useMemo(
    () =>
      Gesture.Pan()
        // Reanimated 4 workletise les callbacks de geste (thread UI) : les
        // refs y sont serialisees et `dragRotate` (objet JS three.js) n'y est
        // pas accessible. runOnJS force le thread JS, ou vit le runtime —
        // le drag n'est pas un chemin a 60fps contraint.
        .runOnJS(true)
        // Un seul doigt : a partir de 2, ce geste echoue et laisse la place
        // aux gestes zoom/profondeur.
        .maxPointers(1)
        .minDistance(4)
        .onBegin((event) => {
          // Test elliptique (rayons = fractions ecran du runtime) : une bbox
          // rectangulaire couvrirait presque toute la largeur d'une vue
          // portrait, l'ellipse laisse les coins/haut/bas a l'alcove.
          const zone = runtimeRef.current?.getAvatarZone();
          const { width, height } = viewSizeRef.current;
          if (zone == null || width === 0 || height === 0) {
            dragTargetRef.current = 'alcove';
            return;
          }
          const nx = (event.x - width / 2) / (zone.halfWidthFrac * width);
          const ny = (event.y - height / 2) / (zone.halfHeightFrac * height);
          dragTargetRef.current = nx * nx + ny * ny <= 1 ? 'avatar' : 'alcove';
        })
        .onChange((event) => {
          const delta = event.translationX - lastPanXRef.current;
          lastPanXRef.current = event.translationX;
          // ~0.01 rad/px : un tiers d'ecran ≈ 180 degres.
          runtimeRef.current?.dragRotate(dragTargetRef.current, delta * 0.01);
        })
        .onFinalize(() => {
          lastPanXRef.current = 0;
          commitPose();
        }),
    [commitPose]
  );

  /** Zoom : pincer/ecarter ; e.scale est cumulatif depuis le debut du geste. */
  const pinchStartZoomRef = useRef(1);
  const pinchGesture = useMemo(
    () =>
      Gesture.Pinch()
        .runOnJS(true)
        .onBegin(() => {
          pinchStartZoomRef.current = runtimeRef.current?.getPose().zoom ?? 1;
        })
        .onChange((event) => {
          runtimeRef.current?.setZoom(pinchStartZoomRef.current * event.scale);
        })
        .onFinalize(commitPose),
    [commitPose]
  );

  /**
   * Profondeur : pan a deux doigts, vertical. Tirer vers le haut avance
   * l'avatar vers la camera. Borne par setDepth (min/max du contrat).
   */
  const depthStartRef = useRef(0);
  const depthGesture = useMemo(
    () =>
      Gesture.Pan()
        .runOnJS(true)
        .minPointers(2)
        .onBegin(() => {
          depthStartRef.current = runtimeRef.current?.getPose().depth ?? 0;
        })
        .onChange((event) => {
          // ~0.001 unite monde/px : ±0.25 atteint en un quart d'ecran.
          runtimeRef.current?.setDepth(
            depthStartRef.current - event.translationY * 0.001
          );
        })
        .onFinalize(commitPose),
    [commitPose]
  );

  // Simultane : pincer et translation 2 doigts vivent ensemble (zoom +
  // profondeur d'un meme mouvement), le pan 1 doigt s'efface au-dela d'1 doigt.
  const orbitGesture = useMemo(
    () => Gesture.Simultaneous(singlePanGesture, depthGesture, pinchGesture),
    [singlePanGesture, depthGesture, pinchGesture]
  );

  return (
    <View style={styles.container}>
      <GestureDetector gesture={orbitGesture}>
        <View
          style={styles.stage}
          onLayout={(event) => {
            viewSizeRef.current = {
              width: event.nativeEvent.layout.width,
              height: event.nativeEvent.layout.height,
            };
          }}
        >
          <GLView
            key={`${modelRefId}-${retryCounter}`}
            style={StyleSheet.absoluteFill}
            onContextCreate={(gl) => {
              glRef.current = gl;
              void loadScene(gl, gl.drawingBufferWidth, gl.drawingBufferHeight);
            }}
          />
          {status.kind !== 'ready' && (
            <View style={styles.overlay}>
              {status.kind === 'loading' ? (
                <ActivityIndicator size="small" color="#4a90d9" />
              ) : (
                <>
                  <Text style={styles.errorText}>{status.message}</Text>
                  <Pressable
                    style={styles.retryButton}
                    accessibilityRole="button"
                    accessibilityLabel="Réessayer le chargement du preview"
                    onPress={() => setRetryCounter((count) => count + 1)}
                  >
                    <Text style={styles.retryText}>Réessayer</Text>
                  </Pressable>
                </>
              )}
            </View>
          )}
        </View>
      </GestureDetector>
      <View style={styles.controls}>
        <View style={styles.controlsHeader}>
          <Pressable
            style={styles.resetButton}
            accessibilityRole="button"
            accessibilityLabel="Réinitialiser la pose du preview"
            onPress={resetPose}
          >
            <Text style={styles.resetText}>Réinitialiser</Text>
          </Pressable>
        </View>
        <View style={styles.sliderRow}>
          <Text style={styles.sliderLabel}>Zoom ×{zoomDisplay.toFixed(2)}</Text>
          <Slider
            style={styles.slider}
            minimumValue={POSE_ZOOM_MIN}
            maximumValue={POSE_ZOOM_MAX}
            step={0.05}
            value={zoomDisplay}
            onValueChange={(value) => {
              setZoomDisplay(value);
              runtimeRef.current?.setZoom(value);
            }}
            onSlidingComplete={(value) => {
              setZoomDisplay(value);
              runtimeRef.current?.setZoom(value);
              commitPose();
            }}
            accessibilityLabel="Zoom de la caméra du preview"
            minimumTrackTintColor="#4a90d9"
            maximumTrackTintColor="#334155"
          />
        </View>
        <View style={styles.sliderRow}>
          <Text style={styles.sliderLabel}>
            Profondeur {depthDisplay >= 0 ? '+' : ''}
            {depthDisplay.toFixed(2)}
          </Text>
          <Slider
            style={styles.slider}
            minimumValue={POSE_DEPTH_MIN}
            maximumValue={POSE_DEPTH_MAX}
            step={0.01}
            value={depthDisplay}
            onValueChange={(value) => {
              setDepthDisplay(value);
              runtimeRef.current?.setDepth(value);
            }}
            onSlidingComplete={(value) => {
              setDepthDisplay(value);
              runtimeRef.current?.setDepth(value);
              commitPose();
            }}
            accessibilityLabel="Profondeur de l'avatar dans l'alcove"
            minimumTrackTintColor="#4a90d9"
            maximumTrackTintColor="#334155"
          />
        </View>
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0b1120',
    overflow: 'hidden',
  },
  stage: {
    flex: 1,
    overflow: 'hidden',
  },
  controls: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    gap: 2,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#1f2937',
  },
  controlsHeader: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    marginBottom: 4,
  },
  resetButton: {
    minHeight: 32,
    paddingHorizontal: 12,
    justifyContent: 'center',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#334155',
  },
  resetText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#94a3b8',
  },
  sliderRow: {
    gap: 0,
  },
  sliderLabel: {
    fontSize: 12,
    lineHeight: 18,
    color: '#94a3b8',
    fontVariant: ['tabular-nums'],
  },
  slider: {
    height: 36,
  },
  overlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    backgroundColor: 'rgba(255, 255, 255, 0.7)',
  },
  errorText: {
    fontSize: 14,
    lineHeight: 20,
    textAlign: 'center',
    color: '#111827',
  },
  retryButton: {
    marginTop: 16,
    minHeight: 44,
    paddingHorizontal: 20,
    borderRadius: 10,
    backgroundColor: '#4a90d9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  retryText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#ffffff',
  },
});

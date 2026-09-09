import {
  memo,
  useCallback,
  useEffect,
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
import { useConfigStore } from '../../stores/configStore';
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
  const [retryCounter, setRetryCounter] = useState(0);
  const [status, setStatus] = useState<PreviewStatus>({ kind: 'loading' });

  /** Runtime courant ; nul tant que non charge, null apres dispose. */
  const runtimeRef = useRef<PreviewHandle | null>(null);
  const rafRef = useRef<number | null>(null);
  const lastFrameRef = useRef<number | null>(null);
  const appStateRef = useRef<AppStateStatus>(AppState.currentState);

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

  return (
    <View style={styles.container}>
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
  );
});

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0b1120',
    overflow: 'hidden',
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

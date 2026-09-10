import { useCallback, useEffect, useRef, useState } from 'react';
import {
  AppState,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type AppStateStatus,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AvatarPreview } from '../../components/avatar/AvatarPreview';

/**
 * Harnais de validation Phase 4 (PLAN.md, gates de sortie Phase 4).
 *
 * Automatise sur appareil ce que TypeScript ne peut pas verifier :
 * - dix rechargements du runtime sur LE MEME contexte GL, with temps de
 *   chargement (gate : aucun rendu dupliqué, rechargement de modèle) ;
 * - journal des transitions background/foreground pendant la run (gate 4.1) ;
 * - erreurs affichées en clair avec arrêt de la run.
 *
 * Le remontage complet du composant (montage/démontage du contexte EGL) a
 * prouvé un deadlock natif côté Expo Go : testé via navigation réelle, cf.
 * fiche de portage Phase 4.
 *
 * Reste au jugement humain (affiché dans le plan, pas automatisable ici) :
 * * le rendu visuel : aucune image dupliquée après les 10 rechargements ;
 * * la stabilité de l'animation au retour foreground ;
 * * la mémoire : profiler Android / Instruments iOS.
 *
 * Écran de développement : biaise le compte de cycles si on revient dessus
 * pendant une run — relancer depuis le début le cas échéant.
 */

/** Nombre de cycles du gate « aucun rendu duplique apres dix montages ». */
const CYCLE_COUNT = 10;

/** Delai entre fin d'un cycle et rechargement suivant (ms). */
const TEARDOWN_DELAY_MS = 400;

/** Watchdog par cycle : aucun callback du preview apres ce delai → echec. */
const CYCLE_TIMEOUT_MS = 15000;

/** Ligne de journal du harnais. */
type LogEntry = { id: string; text: string };

export default function AvatarValidationScreen() {
  /** Cycle courant (0 = inactif) ; ref pour eviter les stale closures. */
  const cycleRef = useRef(0);
  const [cycle, setCycle] = useState(0);
  const [running, setRunning] = useState(false);
  const [log, setLog] = useState<LogEntry[]>([]);
  const logIdRef = useRef(0);
  const cycleTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** Signal de rechargement runtime : increment = un cycle de chargement. */
  const [reloadSignal, setReloadSignal] = useState(0);
  const [previewMounted, setPreviewMounted] = useState(false);
  // previewMounted toujours rendu une fois une run demandee : le composant
  // garde son contexte GL pour toute la session de validation.

  const haltRun = useCallback(() => {
    clearCycleTimeout();
    cycleRef.current = 0;
    setCycle(0);
    setRunning(false);
  }, []);

  const appendLog = useCallback((text: string) => {
    // Id monotonic + suffixe aleatoire : Fast Refresh preserve le state `log`
    // mais repartit les refs a 0 — sans suffixe, deux runs partageaient des
    // ids et la liste rendait des clés dupliquées (crash du journal).
    const id = `${++logIdRef.current}-${Math.random().toString(36).slice(2, 8)}`;
    setLog((entries) => [...entries.slice(-99), { id, text }]);
  }, []);

  const clearCycleTimeout = useCallback(() => {
    if (cycleTimeoutRef.current !== null) {
      clearTimeout(cycleTimeoutRef.current);
      cycleTimeoutRef.current = null;
    }
  }, []);

  const onAppStateChange = useCallback(
    (next: AppStateStatus) => {
      if (running) appendLog(`AppState: ${next}`);
    },
    [running, appendLog]
  );

  useEffect(() => {
    const subscription = AppState.addEventListener('change', onAppStateChange);
    return () => subscription.remove();
  }, [onAppStateChange]);

  /** Arme le watchdog du cycle en cours. */
  const armCycleTimeout = useCallback(() => {
    clearCycleTimeout();
    cycleTimeoutRef.current = setTimeout(() => {
      appendLog(
        `Cycle ${cycleRef.current} : echec — aucun callback du preview en ` +
          `${CYCLE_TIMEOUT_MS / 1000} s`
      );
      haltRun();
    }, CYCLE_TIMEOUT_MS);
  }, [appendLog, clearCycleTimeout, haltRun]);

  const onReady = useCallback(
    (loadMs: number) => {
      clearCycleTimeout();
      appendLog(`Cycle ${cycleRef.current} : ready en ${loadMs} ms`);
      if (cycleRef.current >= CYCLE_COUNT) {
        cycleRef.current = 0;
        setCycle(0);
        setRunning(false);
        appendLog('Termine : 10 rechargements completes');
        return;
      }
      setTimeout(() => {
        const next = cycleRef.current + 1;
        cycleRef.current = next;
        setCycle(next);
        setReloadSignal((signal) => signal + 1);
        armCycleTimeout();
      }, TEARDOWN_DELAY_MS);
    },
    [appendLog, armCycleTimeout, clearCycleTimeout]
  );

  const onStage = useCallback(
    (stage: 'mounted' | 'context' | 'assets' | 'runtime' | 'loop-start') => {
      appendLog(`Cycle ${cycleRef.current} : ${stage}`);
    },
    [appendLog]
  );

  const onError = useCallback(
    (message: string) => {
      appendLog(`Cycle ${cycleRef.current} : ERREUR — ${message}`);
      haltRun();
    },
    [appendLog, haltRun]
  );

  /** Nettoyage du watchdog au demontage de l'ecran. */
  useEffect(() => clearCycleTimeout, [clearCycleTimeout]);

  const startRun = useCallback(() => {
    cycleRef.current = 1;
    setCycle(1);
    setLog([]);
    setRunning(true);
    appendLog('Début : 10 rechargements runtime, même contexte GL');
    setPreviewMounted(true);
    setReloadSignal((signal) => signal + 1);
    armCycleTimeout();
  }, [appendLog, armCycleTimeout]);

  const startBackgroundTest = useCallback(() => {
    cycleRef.current = 0;
    setCycle(0);
    setRunning(true);
    appendLog('Test bg/fg : arrière-plan puis retour, 2 fois');
    setPreviewMounted(true);
  }, [appendLog]);

  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      <View style={styles.actions}>
        <Pressable style={styles.button} onPress={startRun} disabled={running}>
          <Text style={styles.buttonText}>Lancer 10 cycles</Text>
        </Pressable>
        <Pressable
          style={styles.button}
          onPress={startBackgroundTest}
          disabled={running}
        >
          <Text style={styles.buttonText}>Test background</Text>
        </Pressable>
      </View>
      <View style={styles.stage}>
        {previewMounted && (
          <AvatarPreview
            onReady={onReady}
            onError={onError}
            onStage={onStage}
            reloadSignal={reloadSignal}
          />
        )}
      </View>
      <View style={styles.logWrap}>
        <Text style={styles.logTitle}>
          Journal {running ? `— cycle ${cycle}` : ''}
        </Text>
        <ScrollView style={styles.logScroll} contentContainerStyle={styles.log}>
          {log.map((entry) => (
            <Text key={entry.id} style={styles.logLine}>
              {entry.text}
            </Text>
          ))}
        </ScrollView>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#0b1120' },
  actions: {
    flexDirection: 'row',
    gap: 12,
    padding: 12,
    justifyContent: 'center',
  },
  button: {
    minHeight: 44,
    paddingHorizontal: 16,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#334155',
  },
  buttonText: { color: '#e2e8f0', fontWeight: '600' },
  stage: { flex: 1 },
  logWrap: {
    maxHeight: 190,
    borderTopWidth: 1,
    borderTopColor: '#1f2937',
  },
  logTitle: {
    color: '#64748b',
    fontSize: 11,
    paddingHorizontal: 12,
    paddingTop: 6,
  },
  logScroll: { flex: 1 },
  log: { padding: 12, gap: 2 },
  logLine: { color: '#94a3b8', fontSize: 12 },
});

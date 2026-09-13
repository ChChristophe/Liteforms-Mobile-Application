import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { useConfigStore } from '../stores/configStore';
import { useOnboardingStore } from '../stores/onboardingStore';

/**
 * Layout racine de la navigation native.
 *
 * Montage :
 * - fournit le `GestureHandlerRootView` requis par react-native-gesture-handler
 *   (geste d'orbite du preview avatar, PLAN.md sous-phase 4.5) ;
 * - fournit le `SafeAreaProvider` utilise par tous les ecrans ;
 * - declenche UNE fois l'hydratation du store de configuration depuis
 *   AsyncStorage, avant que les ecrans n'affichent des valeurs finales ;
 * - declenche UNE fois la reconnexion automatique de l'onboarding « zéro IP »
 *   (dec. 13/09/2026) : health check des coordonnees connues puis scan
 *   du /24 — non bloquant, le resultat vit dans `onboardingStore` ;
 * - monte la pile racine et expose uniquement le groupe `(setup)`.
 *
 * Le groupe `(main)` sera ajoute en Phase 1 lorsque le setup sera navigable
 * de bout en bout, conformement au PLAN.md.
 *
 * Au demontage : aucun etat global possede ; l'hydratation est idempotente
 * et survit au remontage (garde `hydrated` dans le store).
 */
export default function RootLayout() {
  const hydrate = useConfigStore((state) => state.hydrate);

  useEffect(() => {
    void hydrate();
    // Reconnexion auto : une seule fois au lancement, jamais pendant
    // un flow en cours (guard de `startDiscovery`).
    if (useOnboardingStore.getState().phase === 'idle') {
      void useOnboardingStore.getState().startDiscovery();
    }
  }, [hydrate]);

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <StatusBar style="dark" />
        <Stack screenOptions={{ headerShown: false }}>
          <Stack.Screen name="(setup)" />
        </Stack>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

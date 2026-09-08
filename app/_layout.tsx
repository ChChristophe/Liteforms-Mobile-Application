import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { useConfigStore } from '../stores/configStore';

/**
 * Layout racine de la navigation native.
 *
 * Montage :
 * - fournit le `SafeAreaProvider` utilise par tous les ecrans ;
 * - declenche UNE fois l'hydratation du store de configuration depuis
 *   AsyncStorage, avant que les ecrans n'affichent des valeurs finales ;
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
  }, [hydrate]);

  return (
    <SafeAreaProvider>
      <StatusBar style="dark" />
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="(setup)" />
      </Stack>
    </SafeAreaProvider>
  );
}

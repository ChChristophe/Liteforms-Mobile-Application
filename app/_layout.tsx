import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';

/**
 * Layout racine de la navigation native.
 *
 * Montage :
 * - fournit le `SafeAreaProvider` utilise par tous les ecrans ;
 * - monte la pile racine et expose uniquement le groupe `(setup)`.
 *
 * Le groupe `(main)` sera ajoute en Phase 1 lorsque le setup sera navigable
 * de bout en bout, conformement au PLAN.md.
 *
 * Au demontage : aucun etat global, aucune ressource native possedee.
 */
export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <StatusBar style="dark" />
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="(setup)" />
      </Stack>
    </SafeAreaProvider>
  );
}

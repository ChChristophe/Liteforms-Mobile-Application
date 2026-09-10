import { Stack } from 'expo-router';
import { Link } from 'expo-router';
import { Pressable, Text } from 'react-native';

/**
 * Layout du groupe `(setup)`.
 *
 * Les ecrans du wizard s'empilent avec un entete natif (bouton retour
 * systeme) ; l'entree du groupe reste sans entete. Chaque ecran declare ici
 * son titre pour la barre native. Le groupe reste accessible hors reseau.
 */
export default function SetupLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }} initialRouteName="index">
      <Stack.Screen name="index" />
      <Stack.Screen
        name="character"
        options={{ headerShown: true, title: 'Identité' }}
      />
      <Stack.Screen
        name="environment"
        options={{ headerShown: true, title: 'Ambiance' }}
      />
      <Stack.Screen
        name="providers"
        options={{ headerShown: true, title: 'Providers' }}
      />
      <Stack.Screen
        name="vrm-select"
        options={{ headerShown: true, title: 'Modèle VRM' }}
      />
      <Stack.Screen
        name="review"
        options={{ headerShown: true, title: 'Récapitulatif' }}
      />
      <Stack.Screen
        name="avatar-preview"
        options={{
          headerShown: true,
          title: "Aperçu de l'avatar",
          headerRight: () =>
            // Harnais Phase 4 : lien de test uniquement en developpement ;
            // masque du build de production (Phase 10).
            __DEV__ ? (
              <Link href="/avatar-validation" asChild>
                <Pressable hitSlop={12}>
                  <Text style={{ color: '#4a90d9', fontWeight: '600' }}>
                    Test
                  </Text>
                </Pressable>
              </Link>
            ) : null,
        }}
      />
      <Stack.Screen name="avatar-validation" options={{ headerShown: true, title: 'Validation Phase 4' }} />
    </Stack>
  );
}

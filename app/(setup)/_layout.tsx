import { Stack } from 'expo-router';

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
        name="avatar-preview"
        options={{ headerShown: true, title: "Aperçu de l'avatar" }}
      />
    </Stack>
  );
}

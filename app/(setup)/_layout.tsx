import { Stack } from 'expo-router';

/**
 * Layout du groupe `(setup)`.
 *
 * Les ecrans du wizard de configuration s'empilent sans entete natif ;
 * l'ecran de preview rouvre l'entete natif pour beneficier du bouton retour
 * fourni par le systeme. Le groupe reste accessible hors reseau.
 */
export default function SetupLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }} initialRouteName="index">
      <Stack.Screen name="index" />
      <Stack.Screen
        name="avatar-preview"
        options={{ headerShown: true, title: "Aperçu de l'avatar" }}
      />
    </Stack>
  );
}

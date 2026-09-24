import { Stack } from 'expo-router';
import { Link } from 'expo-router';
import { Pressable, Text } from 'react-native';
import { ConnectionStatusDot } from '../../components/connection/ConnectionStatusDot';

/**
 * Layout du groupe `(setup)`.
 *
 * Les ecrans du wizard s'empilent avec un entete natif (bouton retour
 * systeme) ; l'entree du groupe reste sans entete. Chaque ecran declare ici
 * son titre pour la barre native. Le groupe reste accessible hors reseau.
 *
 * `headerRight` partage : la pastille de liaison Mobile <-> Electron est
 * affichee sur tous les ecrans a entete. Un ecran peut la remplacer en
 * declarant son propre `headerRight` (cas de `avatar-preview`, harnais de
 * dev) — comportement existant conserve.
 */
export default function SetupLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        headerRight: () => <ConnectionStatusDot />,
      }}
      initialRouteName="index"
    >
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
        name="wake-word"
        options={{ headerShown: true, title: 'Wake word' }}
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
      <Stack.Screen
        name="desktop"
        options={{ headerShown: true, title: 'Desktop' }}
      />
      <Stack.Screen
        name="hue"
        options={{ headerShown: true, title: 'Philips Hue' }}
      />
      <Stack.Screen
        name="news"
        options={{ headerShown: true, title: 'Revue de presse' }}
      />
      <Stack.Screen
        name="spotify"
        options={{ headerShown: true, title: 'Spotify' }}
      />
      <Stack.Screen
        name="spotify-devices"
        options={{ headerShown: true, title: 'Appareils Spotify' }}
      />
      <Stack.Screen
        name="connect"
        options={{ headerShown: true, title: 'Connexion' }}
      />
      <Stack.Screen
        name="advanced-connection"
        options={{
          headerShown: true,
          title: 'Connexion avancée',
        }}
      />
      <Stack.Screen name="avatar-validation" options={{ headerShown: true, title: 'Validation Phase 4' }} />
    </Stack>
  );
}

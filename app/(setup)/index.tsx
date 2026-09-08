import { useRouter } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, Text } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

/**
 * Point d'entree du parcours de configuration (groupe `(setup)`).
 *
 * Premier ecran natif, fonctionne sans reseau : presente le flux
 * configuration -> synchronisation Desktop et redirige vers le stub de
 * preview avatar. Aucun appel reseau ni provider n'est effectue (regle
 * produit : le Mobile ne fait aucun appel API externe).
 *
 * Navigation : `useRouter().push` plutot que `Link asChild`, dont le Slot
 * Radix ecrase les styles non-objet (cf. expo/expo#31352).
 *
 * Etats : statique, sans chargement ni erreur. Au demontage : sans effet de
 * bord ; aucun store n'existe encore (Phase 2).
 */
export default function SetupIndexScreen() {
  const router = useRouter();
  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <ScrollView contentContainerStyle={styles.content} bounces={false}>
        <Text style={styles.title}>Liteforms</Text>
        <Text style={styles.subtitle}>Configuration de votre avatar</Text>
        <Text style={styles.description}>
          Connectez votre Desktop Liteforms, configurez votre avatar et
          synchronisez la configuration. Les etapes du wizard arrivent avec
          les prochaines phases.
        </Text>
        <Pressable
          style={({ pressed }) => [styles.button, pressed && styles.buttonPressed]}
          accessibilityRole="button"
          accessibilityLabel="Ouvrir l'aperçu de l'avatar"
          onPress={() => router.push('/avatar-preview')}
        >
          <Text style={styles.buttonText}>Aperçu de l'avatar</Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: '#ffffff',
  },
  content: {
    flexGrow: 1,
    justifyContent: 'center',
    padding: 24,
  },
  title: {
    fontSize: 32,
    fontWeight: '700',
    color: '#111827',
  },
  subtitle: {
    marginTop: 4,
    fontSize: 18,
    fontWeight: '500',
    color: '#4b5563',
  },
  description: {
    marginTop: 16,
    fontSize: 15,
    lineHeight: 22,
    color: '#6b7280',
  },
  button: {
    marginTop: 32,
    minHeight: 48,
    borderRadius: 12,
    backgroundColor: '#4a90d9',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  buttonPressed: {
    opacity: 0.7,
  },
  buttonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#ffffff',
  },
});

import { useEffect } from 'react';
import { useRouter } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useConfigStore } from '../../stores/configStore';
import { useOnboardingStore } from '../../stores/onboardingStore';
import { wakeWordLabel } from '../../lib/wakeword/catalog';
import { ConnectionStatusDot } from '../../components/connection/ConnectionStatusDot';

/** Entree du menu de configuration. */
type MenuEntry = {
  /** Titre principal de l'entree. */
  title: string;
  /** Description courte affichee sous le titre. */
  subtitle: string;
  /** Route cible relative au groupe `(setup)`. */
  href:
    | '/character'
    | '/environment'
    | '/providers'
    | '/wake-word'
    | '/vrm-select'
     | '/review'
      | '/avatar-preview'
      | '/desktop'
      | '/hue'
      | '/news'
      | '/spotify'
      | '/spotify-devices'
      | '/connect';
};

/**
 * Point d'entree du parcours de configuration (groupe `(setup)`).
 *
 * Menu natif hors reseau listant les etapes disponibles. Chaque ecran lit et
 * ecrit le store de configuration ; aucune API externe n'est appelee (regle
 * produit). Les etapes providers / VRM / review arrivent en Phase 3 (suite)
 * et seront ajoutees ici.
 *
 * Au demontage : sans effet de bord ; le store persiste.
 */
export default function SetupIndexScreen() {
  const router = useRouter();
  const phase = useOnboardingStore((s) => s.phase);

  // Decision produit (dec. 13/09/2026) : le PREMIER ecran de la app est
  // l'appairage, pas ce menu. Tant que l'onboarding n'est pas termine
  // (phase !== 'connected'), ce menu redirige vers /connect — y compris
  // pendant la course au montage (phase `idle` pendant `startDiscovery` :
  // l'ecran /connect affiche « Recherche… » puis le resultat). Une fois
  // connecte, pas de redirection : le « Continuer » de /connect mene ici.
  useEffect(() => {
    if (phase !== 'connected') router.replace('/connect');
  }, [phase, router]);
  const characterName = useConfigStore((state) => state.config.character.name);
  const alcoveColor = useConfigStore((state) => state.config.environment.alcoveColor);
  const modelFileName = useConfigStore((state) => state.config.avatar.modelRef.fileName);
  const wakeWord = useConfigStore((state) => state.config.wakeWord.model);

  const entries: MenuEntry[] = [
    {
      title: 'Identité',
      subtitle: `Nom, pronoms, personnalité — actuellement : ${characterName.trim() || 'non défini'}`,
      href: '/character',
    },
    {
      title: 'Ambiance',
      subtitle: alcoveColor
        ? "Mood et couleur d'alcove — actuellement : couleur personnalisée"
        : "Mood et couleur d'alcove — actuellement : défaut",
      href: '/environment',
    },
    {
      title: 'Providers',
      subtitle: 'LLM, TTS et STT — catalogues statiques, sans appel réseau',
      href: '/providers',
    },
    {
      title: 'Wake word',
      subtitle: `Mot d'éveil — actuellement : ${wakeWordLabel(wakeWord)}`,
      href: '/wake-word',
    },
    {
      title: 'Modèle VRM',
      subtitle: `Référence du modèle — actuellement : ${modelFileName}`,
      href: '/vrm-select',
    },
    {
      title: 'Récapitulatif',
      subtitle: 'Tout ce que vous êtes prêt à envoyer au Desktop',
      href: '/review',
    },
    {
      title: "Aperçu de l'avatar",
      subtitle: 'Preview du modèle sélectionné (rendu 3D natif)',
      href: '/avatar-preview',
    },
    {
      title: 'Desktop',
      subtitle: 'Statut la connexion et re-reconnexion de l\'appliance',
      href: '/desktop',
    },
    {
      title: 'Philips Hue',
      subtitle: 'Appairage du bridge Hue depuis le téléphone',
      href: '/hue',
    },
    {
      title: 'Revue de presse',
      subtitle: 'Flux suivis (blogwatcher) et recherche de nouveaux articles',
      href: '/news',
    },
    {
      title: 'Spotify',
      subtitle: 'Connexion du compte et nommage des appareils',
      href: '/spotify',
    },
    {
      title: 'Connexion',
      subtitle: 'Appairage « zéro IP » automatique (WiFi ou hotspot)',
      href: '/connect',
    },
  ];

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <ScrollView contentContainerStyle={styles.content} bounces={false}>
        <View style={styles.headerRow}>
          <View style={styles.headerTitles}>
            <Text style={styles.title}>Liteforms</Text>
            <Text style={styles.subtitle}>Configuration de votre avatar</Text>
          </View>
          {/* L'ecran n'a pas d'en-tete natif : la pastille de liaison est
              posee en haut a droite, meme role que le headerRight partage. */}
          <ConnectionStatusDot />
        </View>
        <View style={styles.menu}>
          {entries.map((entry) => (
            <Pressable
              key={entry.href}
              style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
              accessibilityRole="button"
              accessibilityLabel={entry.title}
              onPress={() => router.push(entry.href)}
            >
              <View style={styles.rowAccent} />
              <View style={styles.rowText}>
                <Text style={styles.rowTitle}>{entry.title}</Text>
                <Text style={styles.rowSubtitle}>{entry.subtitle}</Text>
              </View>
              <Text style={styles.chevron}>›</Text>
            </Pressable>
          ))}
        </View>
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
    padding: 24,
  },
  headerRow: {
    marginTop: 24,
    marginBottom: 28,
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 12,
  },
  headerTitles: {
    flex: 1,
  },
  title: {
    fontSize: 32,
    fontWeight: '700',
    color: '#111827',
  },
  subtitle: {
    marginTop: 4,
    fontSize: 16,
    color: '#6b7280',
  },
  menu: {
    gap: 12,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 72,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    backgroundColor: '#ffffff',
    padding: 16,
    gap: 14,
  },
  rowPressed: {
    backgroundColor: '#f3f4f6',
  },
  rowAccent: {
    width: 4,
    alignSelf: 'stretch',
    borderRadius: 2,
    backgroundColor: '#4a90d9',
  },
  rowText: {
    flex: 1,
  },
  rowTitle: {
    fontSize: 17,
    fontWeight: '600',
    color: '#111827',
  },
  rowSubtitle: {
    marginTop: 2,
    fontSize: 13,
    lineHeight: 18,
    color: '#6b7280',
  },
  chevron: {
    fontSize: 22,
    color: '#9ca3af',
  },
});

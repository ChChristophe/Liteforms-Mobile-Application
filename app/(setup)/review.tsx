import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { type DeviceConfig } from '../../types/config';
import { validateDeviceConfig } from '../../lib/config/validation';
import { useConfigStore } from '../../stores/configStore';

/**
 * Recapitulatif navigable de la configuration (Phase 3 etape 6).
 *
 * Comportement :
 * - affiche chaque section du contrat (identite, ambiance, modele VRM,
 *   providers) telle qu'elle sera envoyee au Desktop ;
 * - chaque section est TAPABLE et ramene sur son ecran de configuration :
 *   Identite -> /character, Ambiance -> /environment, Modele VRM ->
 *   /vrm-select, LLM/TTS/STT -> /providers (les trois slots partagent
 *   l'ecran ; le ciblage par section n'existe pas encore) ;
 * - re-valide la configuration complete avec `validateDeviceConfig` et
 *   affiche le statut global plus les erreurs champ par champ ; c'est la
 *   meme barriere qui bloquera l'envoi en Phase 6 ;
 * - bouton d'envoi en PLACEHOLDER : la connexion Desktop arrive en Phase 6
 *   (route `/api/device-config`, pairing, cf. PLAN.md). Desactive tant que
 *   la configuration est invalide.
 * - "Reinitialiser" restaure les defauts du store.
 *
 * Aucun secret n'apparait (D1) : la configuration affichee est non secrete
 * par construction.
 *
 * Au demontage : sans effet de bord.
 */

/** Libelle des pronoms pour le resume. */
function pronounLabel(pronouns: DeviceConfig['character']['pronouns']): string {
  return { HE: 'He (il)', SHE: 'She (elle)', THEY: 'They (iel)' }[pronouns];
}

/** Libelle de l'humeur, ou "Defaut" si `null`. */
function moodLabel(mood: DeviceConfig['avatar']['mood']): string {
  return mood ?? 'Défaut';
}

/**
 * Ligne de section tapable. Affiche un titre, une/des lignes de detail et
 * un chevron ; le tap pousse la route de configuration associee.
 */
function SectionLink({
  href,
  title,
  children,
}: {
  /** Route de configuration cible. */
  href: '/character' | '/environment' | '/vrm-select' | '/providers';
  /** Titre de la section. */
  title: string;
  /** Lignes de detail libres. */
  children: React.ReactNode;
}) {
  const router = useRouter();
  return (
    <Pressable
      style={({ pressed }) => [styles.sectionRow, pressed && styles.sectionPressed]}
      accessibilityRole="button"
      accessibilityLabel={`Modifier ${title}`}
      onPress={() => router.push(href)}
    >
      <View style={styles.sectionText}>
        <Text style={styles.section}>{title}</Text>
        {children}
      </View>
      <Text style={styles.chevron}>›</Text>
    </Pressable>
  );
}

export default function ReviewScreen() {
  const config = useConfigStore((state) => state.config);
  const resetConfig = useConfigStore((state) => state.resetConfig);
  const validation = validateDeviceConfig(config);

  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      <ScrollView contentContainerStyle={styles.content}>
        <View
          style={[styles.statusCard, validation.ok ? styles.statusOk : styles.statusError]}
        >
          <Text style={styles.statusTitle}>
            {validation.ok ? 'Configuration complète et valide' : 'Configuration incomplète'}
          </Text>
          {!validation.ok && validation.errors.map((error) => (
            <Text key={error} style={styles.errorLine}>
              • {error}
            </Text>
          ))}
        </View>

        <SectionLink href="/character" title="Identité">
          <Text style={styles.detail}>
            {config.character.name || '—'} ({pronounLabel(config.character.pronouns)})
          </Text>
          <Text style={styles.detail}>
            Personnalité : {config.character.personality || '—'}
          </Text>
          <Text style={styles.detail}>
            Phrase d'accueil : {config.character.greeting || '—'}
          </Text>
        </SectionLink>

        <SectionLink href="/environment" title="Ambiance">
          <View style={styles.colorRow}>
            <Text style={styles.detail}>
              Mood : {moodLabel(config.avatar.mood)} — Alcove :{' '}
              {config.environment.alcoveColor ?? 'Défaut'}
            </Text>
            {config.environment.alcoveColor !== null && (
              <View
                style={[styles.colorDot, { backgroundColor: config.environment.alcoveColor }]}
              />
            )}
          </View>
        </SectionLink>

        <SectionLink href="/vrm-select" title="Modèle VRM">
          <Text style={styles.detail}>{config.avatar.modelRef.fileName}</Text>
          <Text style={styles.subDetail}>Référence : {config.avatar.modelRef.id}</Text>
        </SectionLink>

        <SectionLink href="/providers" title="Providers">
          {(['llm', 'tts', 'stt'] as const).map((slot) => {
            const selection = config.providers[slot];
            return (
              <Text key={slot} style={styles.detail}>
                <Text style={styles.slotPrefix}>{slot.toUpperCase()} — </Text>
                {selection.provider} · {selection.model || '⚠ modèle requis'}
                {selection.voiceId ? ` — voix ${selection.voiceId}` : ''}
              </Text>
            );
          })}
        </SectionLink>

        <Pressable
          style={({ pressed }) => [styles.sendButton, pressed && styles.pressed]}
          disabled={!validation.ok}
          accessibilityRole="button"
          accessibilityLabel="Envoyer la configuration au Desktop"
          onPress={() => {
            // Phase 6 : envoi reel via lib/network/deviceClient
            // (pairing + endpoint /api/device-config). Placeholder volontaire.
          }}
        >
          <Text style={styles.sendText}>Envoyer au Desktop</Text>
          <Text style={styles.sendSub}>Connexion Desktop — Phase 6</Text>
        </Pressable>

        <Pressable
          style={styles.resetLink}
          accessibilityRole="button"
          accessibilityLabel="Réinitialiser la configuration"
          onPress={resetConfig}
        >
          <Text style={styles.resetText}>Réinitialiser la configuration</Text>
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
    padding: 24,
    paddingBottom: 48,
  },
  statusCard: {
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    marginBottom: 24,
  },
  statusOk: {
    borderColor: '#16a34a',
    backgroundColor: '#f0fdf4',
  },
  statusError: {
    borderColor: '#dc2626',
    backgroundColor: '#fef2f2',
  },
  statusTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: '#111827',
  },
  errorLine: {
    marginTop: 4,
    fontSize: 13,
    color: '#dc2626',
  },
  sectionRow: {
    minHeight: 64,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    backgroundColor: '#ffffff',
    padding: 16,
    marginBottom: 12,
    flexDirection: 'row',
    alignItems: 'center',
  },
  sectionPressed: {
    backgroundColor: '#f3f4f6',
  },
  sectionText: {
    flex: 1,
  },
  section: {
    marginBottom: 6,
    fontSize: 16,
    fontWeight: '700',
    color: '#111827',
  },
  detail: {
    fontSize: 14,
    lineHeight: 20,
    color: '#4b5563',
  },
  subDetail: {
    fontSize: 12,
    color: '#9ca3af',
  },
  slotPrefix: {
    fontWeight: '600',
    color: '#374151',
  },
  colorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  colorDot: {
    width: 18,
    height: 18,
    borderRadius: 5,
    borderWidth: 1,
    borderColor: '#d1d5db',
  },
  chevron: {
    fontSize: 22,
    color: '#9ca3af',
  },
  sendButton: {
    marginTop: 16,
    minHeight: 56,
    borderRadius: 14,
    backgroundColor: '#4a90d9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  pressed: {
    opacity: 0.7,
  },
  sendText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#ffffff',
  },
  sendSub: {
    marginTop: 2,
    fontSize: 12,
    color: '#dbeafe',
  },
  resetLink: {
    marginTop: 24,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  resetText: {
    fontSize: 14,
    color: '#dc2626',
  },
});

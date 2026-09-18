import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import {
  isRealtimeVoiceProvider,
  type DeviceConfig,
  UNCONFIGURED_PROVIDER,
} from '../../types/config';
import { hasUnconfiguredProvider, validateDeviceConfig } from '../../lib/config/validation';
import { applyRealtimeVoiceDefaults } from '../../lib/config/serialization';
import { providerSlotDisplay } from '../../lib/providers/catalog';
import { getProviderStatus, postCredential } from '../../lib/network/deviceClient';
import { useConfigStore } from '../../stores/configStore';
import { useConnectionStore } from '../../stores/connectionStore';
import { useCredentialDraftStore } from '../../stores/credentialDraftStore';
import type { ProviderStatusResponse } from '../../types/device';

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
 * - provider LLM realtime (`openai-realtime`/`google-live`) : TTS et STT
 *   s'affichent « Inclus dans <label LLM> » (comportement Web
 *   `ChatPanel`) et partent remplis des defauts de reference (contrat wire
 *   a trois slots), sans cle TTS/STT ;
 * - bouton d'envoi branche sur `connectionStore.sendConfig` (Phase B, route
 *   contractuelle `POST /api/device-config`) : accuse de reception affiche
 *   avec `appliedAt` et warnings (ex. mood/pose non appliques) ; erreur
 *   contractuelle ou reseau affichee dans le style existant. Desactive si la
 *   configuration est invalide, si aucun Desktop n'est connecte, ou pendant
 *   l'envoi.
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

/**
 * Pousse les clés API des providers sélectionnés (D1) : `POST /api/credentials`
 * pour chaque provider distinct ayant une clé saisie dans le brouillon
 * transitoire. Jamais via device-config, jamais persisté (la clé ne vit que
 * dans `credentialDraftStore`, en mémoire).
 *
 * @returns les erreurs d'envoi par provider (vide = tout est parti).
 */
async function pushCredentials(
  host: string,
  port: number,
  config: DeviceConfig
): Promise<string[]> {
  // Realtime : seuls TTS/STT sont ignorees par l'appliance, seule la cle du
  // provider LLM a un sens (les autres slots peuvent rester d'anciennes
  // selections non modifiables depuis l'ecran providers).
  const slots = isRealtimeVoiceProvider(config.providers.llm.provider)
    ? (['llm'] as const)
    : (['llm', 'tts', 'stt'] as const);
  const selected = slots.map((slot) => config.providers[slot].provider);
  const distinct = Array.from(
    new Set(selected.filter((id) => id !== UNCONFIGURED_PROVIDER))
  );
  const keys = useCredentialDraftStore.getState().keys;
  const errors: string[] = [];
  for (const provider of distinct) {
    const apiKey = keys[provider];
    if (apiKey !== undefined && apiKey.trim().length > 0) {
      const result = await postCredential(host, port, {
        provider,
        apiKey: apiKey.trim(),
      });
      if (!result.ok) errors.push(`${provider} : ${result.error}`);
    }
  }
  return errors;
}

/** Interroge le statut providers (configured/maskedKey), sans erreur fatale. */
async function fetchProviderStatusSafe(
  host: string,
  port: number
): Promise<ProviderStatusResponse | null> {
  const result = await getProviderStatus(host, port);
  return result.ok ? result : null;
}

export default function ReviewScreen() {
  const config = useConfigStore((state) => state.config);
  const resetConfig = useConfigStore((state) => state.resetConfig);
  const sendConfig = useConnectionStore((state) => state.sendConfig);
  const connectedDesktop = useConnectionStore((state) => state.connectedDesktop);
  const validation = validateDeviceConfig(config);
  // Un LLM realtime couvre TTS/STT : ces slots ne bloquent plus l'envoi.
  const realtime = isRealtimeVoiceProvider(config.providers.llm.provider);
  // Un slot encore "none" est VALIDE mais non envoyable : on bloque l'envoi.
  const unconfigured = hasUnconfiguredProvider(config);
  const sendable = validation.ok && !unconfigured;
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [sendAck, setSendAck] = useState<{
    appliedAt: string;
    warnings: string[];
  } | null>(null);
  const [providerStatus, setProviderStatus] = useState<ProviderStatusResponse | null>(null);

  const handleSend = async () => {
    if (!validation.ok || unconfigured || sending) return;
    setSending(true);
    setSendError(null);
    setSendAck(null);
    setProviderStatus(null);
    try {
      // Le contrat wire exige les trois slots : un LLM realtime remplit les
      // slots TTS/STT restes "none" avec les defauts de reference.
      const wireConfig = applyRealtimeVoiceDefaults(validation.config);
      const result = await sendConfig(wireConfig);
      if (!result.ok) {
        setSendError(result.error);
        return;
      }
      setSendAck({ appliedAt: result.appliedAt, warnings: result.warnings });

      // Clés API (D1) : envoi séparé APRES device-config, jamais persisté.
      const { host, port } = useConnectionStore.getState();
      if (host !== null && port !== null) {
        const credentialErrors = await pushCredentials(host, port, wireConfig);
        if (credentialErrors.length > 0) {
          setSendError(`Clés API non envoyées : ${credentialErrors.join(' ; ')}`);
        }
        // Retour de statut (configured/maskedKey), optionnel mais recommandé.
        const status = await fetchProviderStatusSafe(host, port);
        setProviderStatus(status);
      }
    } catch (error) {
      // sendConfig ne doit jamais lever, mais un crash ne doit pas laisser
      // le bouton bloqué en "sending" pour toujours (bug observé au test
      // terrain : bouton non réactivable après le premier envoi).
      setSendError(
        error instanceof Error ? error.message : "Erreur d'envoi inconnue."
      );
    } finally {
      setSending(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      <ScrollView contentContainerStyle={styles.content}>
        <View
          style={[styles.statusCard, sendable ? styles.statusOk : styles.statusError]}
        >
          <Text style={styles.statusTitle}>
            {sendable ? 'Configuration complète et valide' : 'Configuration incomplète'}
          </Text>
          {!validation.ok && validation.errors.map((error) => (
            <Text key={error} style={styles.errorLine}>
              • {error}
            </Text>
          ))}
          {validation.ok && unconfigured && (
            <Text style={styles.errorLine}>
              • {realtime
                ? 'Choisis un provider LLM avant l’envoi.'
                : 'Choisis un provider pour LLM, TTS et STT avant l’envoi.'}
            </Text>
          )}
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
              {config.environment.alcoveColor === null
                ? 'Défaut (appliance)'
                : 'Couleur personnalisée'}
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
          {(['llm', 'tts', 'stt'] as const).map((slot) => (
            <Text key={slot} style={styles.detail}>
              <Text style={styles.slotPrefix}>{slot.toUpperCase()} — </Text>
              {providerSlotDisplay(slot, config.providers[slot], config.providers.llm.provider)}
            </Text>
          ))}
        </SectionLink>

        <Pressable
          style={({ pressed }) => [
            styles.sendButton,
            (!sendable || connectedDesktop === null || sending) && styles.sendDisabled,
            pressed && styles.pressed,
          ]}
          disabled={!sendable || connectedDesktop === null || sending}
          accessibilityRole="button"
          accessibilityLabel="Envoyer la configuration au Desktop"
          onPress={handleSend}
        >
          <Text style={styles.sendText}>
            {sending ? 'Envoi en cours…' : 'Envoyer au Desktop'}
          </Text>
          <Text style={styles.sendSub}>
            {connectedDesktop === null
              ? 'Aucun Desktop connecté'
              : `Connecté : ${connectedDesktop}`}
          </Text>
        </Pressable>

        {sendAck !== null && (
          <View style={styles.ackCard}>
            <Text style={styles.ackTitle}>
              Configuration reçue par le Desktop ({sendAck.appliedAt})
            </Text>
            {sendAck.warnings.map((warning) => (
              <Text key={warning} style={styles.ackWarning}>
                ⚠ {warning}
              </Text>
            ))}
          </View>
        )}
        {providerStatus !== null && (
          <View style={styles.statusCard}>
            <Text style={styles.statusTitle}>Statut des providers</Text>
            {(['llm', 'tts', 'stt'] as const).map((slot) => {
              const s = providerStatus.providers[slot];
              return (
                <Text key={slot} style={styles.detail}>
                  <Text style={styles.slotPrefix}>{slot.toUpperCase()} — </Text>
                  {s.provider} · {s.configured ? `configuré (${s.maskedKey ?? 'masqué'})` : 'non configuré'}
                </Text>
              );
            })}
          </View>
        )}
        {sendError !== null && (
          <Text style={styles.errorLine}>{sendError}</Text>
        )}

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
  sendDisabled: {
    opacity: 0.5,
  },
  ackCard: {
    marginTop: 12,
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: '#16a34a',
    backgroundColor: '#f0fdf4',
  },
  ackTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#166534',
  },
  ackWarning: {
    marginTop: 4,
    fontSize: 13,
    color: '#92400e',
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

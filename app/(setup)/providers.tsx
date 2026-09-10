import { useState } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type {
  LlmProviderId,
  ProviderSelection,
  SttProviderId,
  TtsProviderId,
} from '../../types/config';
import {
  findCatalogEntry,
  LLM_PROVIDERS,
  STT_PROVIDERS,
  TTS_PROVIDERS,
  type ProviderCatalogEntry,
} from '../../lib/providers/catalog';
import { useConfigStore } from '../../stores/configStore';

/**
 * Ecran de selection des providers (LLM / TTS / STT).
 *
 * Regles produit (PLAN.md Phase 3) :
 * - catalogues STATIQUES (`lib/providers/catalog`) : aucun appel API, aucune
 *   decouverte de modeles en direct ;
 * - le Mobile ne teste jamais la configuration (pas d'appel d'endpoint) ;
 * - saisie de cle API possible (D1 : transfert unique authentifie a
 *   Electron en Phase 8, jamais persiste sur Mobile) ;
 * - changer de provider reinitialise model/endpoint/voie aux defauts du
 *   catalogue.
 *
 * Champs :
 * - provider : chips ;
 * - modele : chips si liste statique connue, sinon saisie libre requise ;
 * - voix (TTS) : chips si liste connue, sinon saisie libre ; "Defaut" ecrit
 *   `null` ;
 * - endpoint : saisie libre optionnelle ; vide = `null` (defaut provider).
 *
 * Au demontage : le store conserve la derniere selection ; une selection en
 * cours incomplete (modele vide) n'est persistee que des qu'elle redevient
 * complete, la couche storage refusant toute config invalide.
 */

type SlotKey = "llm" | "tts" | "stt";

/** Formulaire d'un slot provider, genere depuis son catalogue. */
function ProviderSlotForm({
  title,
  catalog,
  selection,
  onChange,
}: {
  /** Titre de section affiche. */
  title: string;
  /** Catalogue statique du slot. */
  catalog: readonly ProviderCatalogEntry<any>[];
  /** Selection courante du store pour ce slot. */
  selection: ProviderSelection<any>;
  /** Commite un patch de selection au store. */
  onChange: (patch: Partial<ProviderSelection>) => void;
}) {
  const [endpointDraft, setEndpointDraft] = useState<string>(selection.endpoint ?? '');

  /** Change de provider et reinitialise aux defauts du catalogue. */
  function selectProvider(entry: ProviderCatalogEntry): void {
    setEndpointDraft(entry.defaultEndpoint ?? '');
    onChange({
      provider: entry.id,
      model: entry.defaultModel ?? '',
      endpoint: entry.defaultEndpoint,
      voiceId: entry.defaultVoice,
    });
  }

  /** Commite l'endpoint : vide = `null` (defaut du provider). */
  function commitEndpoint(): void {
    const value = endpointDraft.trim();
    onChange({ endpoint: value.length > 0 ? value : null });
  }

  const currentEntry = findCatalogEntry(catalog, selection.provider);
  const models = currentEntry?.models ?? null;
  const voices = currentEntry?.voices ?? null;

  return (
    <View style={styles.slot}>
      <Text style={styles.slotTitle}>{title}</Text>

      <Text style={styles.fieldLabel}>Provider</Text>
      <View style={styles.chipWrap}>
        {catalog.map((entry) => {
          const selected = selection.provider === entry.id;
          return (
            <Pressable
              key={entry.id}
              style={[styles.chip, selected && styles.chipSelected]}
              accessibilityRole="button"
              accessibilityState={{ selected }}
              onPress={() => selectProvider(entry)}
            >
              <Text style={[styles.chipText, selected && styles.chipTextSelected]}>
                {entry.label}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {models ? (
        <>
          <Text style={styles.fieldLabel}>Modèle</Text>
          <View style={styles.chipWrap}>
            {models.map((model) => {
              const selected = selection.model === model;
              return (
                <Pressable
                  key={model}
                  style={[styles.chip, selected && styles.chipSelected]}
                  accessibilityRole="button"
                  accessibilityState={{ selected }}
                  onPress={() => onChange({ model })}
                >
                  <Text style={[styles.chipText, selected && styles.chipTextSelected]}>
                    {model}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </>
      ) : (
        <>
          <Text style={styles.fieldLabel}>Modèle (saisie libre)</Text>
          <TextInput
            style={styles.input}
            value={selection.model}
            onChangeText={(text) => onChange({ model: text })}
            placeholder="identifiant du modèle"
            placeholderTextColor="#9ca3af"
            autoCapitalize="none"
            autoCorrect={false}
            accessibilityLabel={`Modèle ${title}`}
          />
        </>
      )}

      {(title === 'TTS' || (currentEntry?.voices ?? null) !== null) && (
        <>
          <Text style={styles.fieldLabel}>
            {voices ? 'Voix' : 'Voix (saisie libre)'}
          </Text>
          {voices ? (
            <View style={styles.chipWrap}>
              <Pressable
                style={[styles.chip, selection.voiceId === null && styles.chipSelected]}
                accessibilityRole="button"
                accessibilityState={{ selected: selection.voiceId === null }}
                onPress={() => onChange({ voiceId: null })}
              >
                <Text style={[styles.chipText, selection.voiceId === null && styles.chipTextSelected]}>
                  Défaut
                </Text>
              </Pressable>
              {voices.map((voice) => {
                const selected = selection.voiceId === voice;
                return (
                  <Pressable
                    key={voice}
                    style={[styles.chip, selected && styles.chipSelected]}
                    accessibilityRole="button"
                    accessibilityState={{ selected }}
                    onPress={() => onChange({ voiceId: voice })}
                  >
                    <Text style={[styles.chipText, selected && styles.chipTextSelected]}>
                      {voice}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          ) : (
            <TextInput
              style={styles.input}
              value={selection.voiceId ?? ''}
              onChangeText={(text) => onChange({ voiceId: text.length > 0 ? text : null })}
              placeholder="voix par défaut si vide"
              placeholderTextColor="#9ca3af"
              autoCapitalize="none"
              autoCorrect={false}
              accessibilityLabel={`Voix ${title}`}
            />
          )}
        </>
      )}

      <Text style={styles.fieldLabel}>Endpoint personnalisé (optionnel)</Text>
      <TextInput
        style={styles.input}
        value={endpointDraft}
        onChangeText={setEndpointDraft}
        onEndEditing={commitEndpoint}
        placeholder="défaut du provider si vide"
        placeholderTextColor="#9ca3af"
        autoCapitalize="none"
        autoCorrect={false}
        accessibilityLabel={`Endpoint ${title}`}
      />
    </View>
  );
}

/**
 * Ecran providers : trois slots pilotant `providers.llm / tts / stt` du
 * store. Aucun appel reseau (rule produit) ; erreurs locales explicites.
 * Au demontage : sans effet de bord.
 */
export default function ProvidersScreen() {
  const providers = useConfigStore((state) => state.config.providers);
  const updateProvider = useConfigStore((state) => state.updateProvider);

  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      <ScrollView contentContainerStyle={styles.content}>
        <ProviderSlotForm
          title="LLM"
          catalog={LLM_PROVIDERS}
          selection={providers.llm}
          onChange={(patch) => updateProvider('llm', patch as Partial<ProviderSelection<LlmProviderId>>)}
        />
        <ProviderSlotForm
          title="TTS"
          catalog={TTS_PROVIDERS}
          selection={providers.tts}
          onChange={(patch) => updateProvider('tts', patch as Partial<ProviderSelection<TtsProviderId>>)}
        />
        <ProviderSlotForm
          title="STT"
          catalog={STT_PROVIDERS}
          selection={providers.stt}
          onChange={(patch) => updateProvider('stt', patch as Partial<ProviderSelection<SttProviderId>>)}
        />
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
    gap: 40,
  },
  slot: {},
  slotTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: '#111827',
    marginBottom: 16,
  },
  fieldLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#374151',
    marginVertical: 8,
  },
  chipWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  chip: {
    minHeight: 44,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#d1d5db',
    backgroundColor: '#f9fafb',
    paddingHorizontal: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chipSelected: {
    borderColor: '#4a90d9',
    backgroundColor: '#e8f2fc',
  },
  chipText: {
    fontSize: 14,
    color: '#4b5563',
  },
  chipTextSelected: {
    color: '#1d4ed8',
    fontWeight: '600',
  },
  input: {
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    color: '#111827',
    backgroundColor: '#f9fafb',
  },
});

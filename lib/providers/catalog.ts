/**
 * Catalogues statiques de providers, portes de `liteforms-web`
 * (`lib/llm/providerOptions.ts`, `lib/speech/providerOptions.ts`).
 *
 * Regles produit (PLAN.md Phase 3) :
 * - le Mobile N'APPELLE JAMAIS ces endpoints : ce catalogue sert uniquement
 *   a l'affichage et la saisie de configuration ;
 * - pas de decouverte de modeles en direct : seuls les modeles statiques
 *   connus sont proposes ; sans liste, la saisie est libre ;
 * - seuls les providers marques `tested` cote Web sont exposes ;
 * - les providers d'execution navigateur sont exclus (`browser-local-*`,
 *   kokoro local, distil-whisper) : le runtime configure est le Desktop.
 * - les credentials ne sont PAS dans ce catalogue (D1 : la cle est saisie
 *   sur Mobile et transferee une seule fois a Electron en Phase 8 ; le
 *   statut configure/non-configure viendra des reponses Desktop).
 */
import type { LlmProviderId, SttProviderId, TtsProviderId } from "../../types/config";

/** Entree de catalogue pour un slot provider. */
export type ProviderCatalogEntry<P extends string = string> = {
  /** Identifiant du provider (valeur de contrat). */
  id: P;
  /** Libelle affiche. */
  label: string;
  /** Modele par defaut, ou `null` si le provider ne declare aucun defaut. */
  defaultModel: string | null;
  /** Endpoint de base par defaut, ou `null`. */
  defaultEndpoint: string | null;
  /** Voix par defaut, ou `null`. */
  defaultVoice: string | null;
  /** Modeles connus ; `null` = saisie libre. */
  models: readonly string[] | null;
  /** Voix connues ; `null` = saisie libre ou non applicable. */
  voices: readonly string[] | null;
  /**
   * `true` si le provider exige une cle API saisie sur Mobile puis transferee
   * une seule fois a l'appliance via `POST /api/credentials` (D1). Quand
   * `true`, l'ecran affiche un champ cle ; sinon aucun (ex. openclaw : token
   * lu automatiquement par l'appliance, openai-codex : appairage appareil).
   */
  requiresKey: boolean;
};

/** LLM testes, charte Web — execution navigateur exclue. */
export const LLM_PROVIDERS: readonly ProviderCatalogEntry<LlmProviderId>[] = [
  {
    id: "anthropic",
    label: "Anthropic API",
    requiresKey: true,
    defaultModel: "claude-opus-4-7",
    defaultEndpoint: "https://api.anthropic.com",
    defaultVoice: null,
    models: [
      "claude-opus-4-7",
      "claude-opus-4-6",
      "claude-opus-4-5",
      "claude-sonnet-4-6",
      "claude-sonnet-4-5",
      "claude-haiku-4-5",
      "claude-haiku-3-5",
    ],
    voices: null,
  },
  {
    id: "openai",
    label: "OpenAI API",
    requiresKey: true,
    defaultModel: "gpt-5.5",
    defaultEndpoint: "https://api.openai.com/v1",
    defaultVoice: null,
    models: ["gpt-5.5", "gpt-5.5-pro", "gpt-5.4", "gpt-5.4-pro", "gpt-5.4-mini", "gpt-5.4-nano"],
    voices: null,
  },
  {
    id: "openai-realtime",
    label: "OpenAI Realtime (TTS+STT)",
    requiresKey: true,
    defaultModel: "gpt-realtime-2",
    defaultEndpoint: "wss://api.openai.com/v1/realtime",
    defaultVoice: "coral",
    models: ["gpt-realtime-2.1", "gpt-realtime-2.1-mini", "gpt-realtime-2", "gpt-realtime"],
    voices: [
      "alloy",
      "ash",
      "ballad",
      "cedar",
      "coral",
      "echo",
      "marin",
      "sage",
      "verse",
    ],
  },
  {
    id: "openai-codex",
    label: "OpenAI Codex",
    requiresKey: false,
    defaultModel: "gpt-5.5",
    defaultEndpoint: "https://chatgpt.com/backend-api/codex",
    defaultVoice: null,
    models: ["gpt-5.5", "gpt-5.5-pro", "gpt-5.4", "gpt-5.4-pro"],
    voices: null,
  },
  {
    id: "google",
    label: "Google AI Studio",
    requiresKey: true,
    defaultModel: "gemini-3.1-pro-preview",
    defaultEndpoint: "https://generativelanguage.googleapis.com/v1beta/openai",
    defaultVoice: null,
    models: [
      "gemini-3.1-pro-preview",
      "gemini-3.1-flash-lite-preview",
      "gemini-3-flash-preview",
      "gemini-3-pro-preview",
      "gemini-2.5-pro",
      "gemini-2.5-flash",
      "gemini-2.5-flash-lite",
      "gemini-pro-latest",
      "gemini-flash-latest",
    ],
    voices: null,
  },
  {
    id: "google-live",
    label: "Google Live (TTS+STT)",
    requiresKey: true,
    defaultModel: "gemini-2.5-flash-native-audio-preview-12-2025",
    defaultEndpoint:
      "wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent",
    defaultVoice: "Kore",
    models: [
      "gemini-2.5-flash-native-audio-preview-12-2025",
      "gemini-live-2.5-flash-preview",
      "gemini-2.0-flash-live-001",
      "gemini-2.5-flash-preview-native-audio-dialog",
      "gemini-2.5-flash-exp-native-audio-thinking-dialog",
    ],
    voices: [
      "Zephyr",
      "Puck",
      "Charon",
      "Kore",
      "Fenrir",
      "Leda",
      "Orus",
      "Aoede",
      "Callirrhoe",
      "Autonoe",
      "Enceladus",
      "Iapetus",
      "Umbriel",
      "Algieba",
      "Despina",
      "Erinome",
      "Algenib",
      "Rasalgethi",
      "Laomedeia",
      "Achernar",
      "Alnilam",
      "Schedar",
      "Gacrux",
      "Pulcherrima",
      "Achird",
      "Zubenelgenubi",
      "Vindemiatrix",
      "Sadachbia",
      "Sadaltager",
      "Sulafat",
    ],
  },
  {
    id: "openrouter",
    label: "OpenRouter",
    requiresKey: true,
    defaultModel: "openai/gpt-5.5",
    defaultEndpoint: "https://openrouter.ai/api/v1",
    defaultVoice: null,
    models: null,
    voices: null,
  },
  {
    id: "openclaw",
    label: "OpenClaw Gateway",
    requiresKey: false,
    defaultModel: "openclaw/default",
    defaultEndpoint: "http://127.0.0.1:18789/v1",
    defaultVoice: null,
    models: null,
    voices: null,
  },
];

/** TTS testes — kokoro local (execution navigateur) exclus. */
export const TTS_PROVIDERS: readonly ProviderCatalogEntry<TtsProviderId>[] = [
  {
    id: "elevenlabs",
    label: "ElevenLabs",
    requiresKey: true,
    defaultModel: "eleven_flash_v2_5",
    defaultEndpoint: "https://api.elevenlabs.io/v1",
    defaultVoice: "CwhRBWXzGAHq8TQ4Fs17",
    models: [
      "eleven_v3",
      "eleven_flash_v2_5",
      "eleven_multilingual_v2",
      "eleven_turbo_v2_5",
      "eleven_monolingual_v1",
    ],
    voices: null,
  },
  {
    id: "deepgram",
    label: "Deepgram",
    requiresKey: true,
    defaultModel: null,
    defaultEndpoint: "https://api.deepgram.com/v1",
    defaultVoice: "aura-asteria-en",
    models: null,
    voices: null,
  },
  {
    id: "openai",
    label: "OpenAI",
    requiresKey: true,
    defaultModel: "gpt-4o-mini-tts",
    defaultEndpoint: "https://api.openai.com/v1",
    defaultVoice: "coral",
    models: ["gpt-4o-mini-tts", "tts-1", "tts-1-hd"],
    voices: [
      "alloy",
      "ash",
      "ballad",
      "cedar",
      "coral",
      "echo",
      "fable",
      "juniper",
      "marin",
      "onyx",
      "nova",
      "sage",
      "shimmer",
      "verse",
    ],
  },
  {
    id: "google",
    label: "Google",
    requiresKey: true,
    defaultModel: "gemini-3.1-flash-tts-preview",
    defaultEndpoint: "https://generativelanguage.googleapis.com",
    defaultVoice: "Kore",
    models: [
      "gemini-3.1-flash-tts-preview",
      "gemini-2.5-flash-preview-tts",
      "gemini-2.5-pro-preview-tts",
    ],
    voices: [
      "Zephyr",
      "Puck",
      "Charon",
      "Kore",
      "Fenrir",
      "Leda",
      "Orus",
      "Aoede",
      "Callirrhoe",
      "Autonoe",
      "Enceladus",
      "Iapetus",
      "Umbriel",
      "Algieba",
      "Despina",
      "Erinome",
      "Algenib",
      "Rasalgethi",
      "Laomedeia",
      "Achernar",
      "Alnilam",
      "Schedar",
      "Gacrux",
      "Pulcherrima",
      "Achird",
      "Zubenelgenubi",
      "Vindemiatrix",
      "Sadachbia",
      "Sadaltager",
      "Sulafat",
    ],
  },
  {
    id: "openrouter",
    label: "OpenRouter",
    requiresKey: true,
    defaultModel: "hexgrad/kokoro-82m",
    defaultEndpoint: "https://openrouter.ai/api/v1",
    defaultVoice: "af_alloy",
    models: [
      "hexgrad/kokoro-82m",
      "google/gemini-3.1-flash-tts-preview",
      "mistralai/voxtral-mini-tts-2603",
      "elevenlabs/eleven-turbo-v2",
    ],
    voices: null,
  },
];

/** STT testes — distil-whisper (execution navigateur) exclus. */
export const STT_PROVIDERS: readonly ProviderCatalogEntry<SttProviderId>[] = [
  {
    id: "deepgram",
    label: "Deepgram",
    requiresKey: true,
    defaultModel: "nova-3",
    defaultEndpoint: "https://api.deepgram.com/v1",
    defaultVoice: null,
    models: null,
    voices: null,
  },
  {
    id: "elevenlabs",
    label: "ElevenLabs",
    requiresKey: true,
    defaultModel: "scribe_v2",
    defaultEndpoint: "https://api.elevenlabs.io/v1",
    defaultVoice: null,
    models: ["scribe_v2", "scribe_v1"],
    voices: null,
  },
  {
    id: "openai",
    label: "OpenAI",
    requiresKey: true,
    defaultModel: "gpt-4o-transcribe",
    defaultEndpoint: "https://api.openai.com/v1",
    defaultVoice: null,
    models: [
      "gpt-transcribe",
      "gpt-4o-transcribe",
      "gpt-4o-mini-transcribe",
      "gpt-4o-transcribe-diarize",
      "whisper-1",
    ],
    voices: null,
  },
];

/**
 * Retrouve l'entree de catalogue d'un provider pour un slot.
 * @returns l'entree, ou `undefined` si l'id n'est pas dans le catalogue
 *   visible (ex. slot configure par un ancien Desktop non visible ici).
 */
export function findCatalogEntry<P extends string>(
  catalog: readonly ProviderCatalogEntry<P>[],
  providerId: string
): ProviderCatalogEntry<P> | undefined {
  return catalog.find((entry) => entry.id === providerId);
}

/**
 * Tous les providers visibles, tous slots confondus. Les ids partages
 * (ex. `openai` en llm/tts/stt) portent un `requiresKey` homogene ; la
 * premiere occurrence suffit pour la recherche.
 */
const ALL_PROVIDER_ENTRIES: readonly ProviderCatalogEntry[] = [
  ...LLM_PROVIDERS,
  ...TTS_PROVIDERS,
  ...STT_PROVIDERS,
];

/**
 * Retrouve l'entree d'un provider dans l'ensemble des catalogues visibles.
 *
 * Utile pour le champ cle API, qui est keye par provider (pas par slot) :
 * `openai` sert aux trois slots avec UNE seule cle (dedoublonnage).
 *
 * @returns l'entree, ou `undefined` si l'id n'est visible dans aucun slot.
 */
export function findProviderEntry(providerId: string): ProviderCatalogEntry | undefined {
  return ALL_PROVIDER_ENTRIES.find((entry) => entry.id === providerId);
}

/**
 * Indique si un provider (tous slots confondus) exige une cle API.
 * @returns `true` si le provider doit afficher un champ cle ; un id absent
 *   des catalogues visibles retourne `false` (defaut sur : pas de champ).
 */
export function providerRequiresKey(providerId: string): boolean {
  return findProviderEntry(providerId)?.requiresKey ?? false;
}

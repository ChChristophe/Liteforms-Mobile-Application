import {
  DEVICE_CONFIG_VERSION,
  UNCONFIGURED_PROVIDER,
  isRealtimeVoiceProvider,
  type DeviceConfig,
  type ProviderSelection,
  type SttProviderId,
  type TtsProviderId,
} from "../../types/config";
import { hasUnconfiguredProvider, validateDeviceConfig } from "./validation";

/**
 * TTS de reference quand un LLM realtime rend le slot inutile. Ids et modeles
 * issus de la reference Web (`normalizeTtsConfig`, provider local kokoro,
 * sans cle) ; l'appliance ignore ce slot des que le LLM est realtime.
 *
 * `endpoint: ""` et non `null` : `isProviders` cote Electron exige un
 * `endpoint` de type string (le slot est ignore fonctionnellement, mais la
 * forme du contrat reste validee). Kokoro n'a pas d'endpoint reseau.
 */
export const REALTIME_TTS_FALLBACK: ProviderSelection<TtsProviderId> = {
  provider: "kokoro",
  model: "onnx-community/Kokoro-82M-v1.0-ONNX",
  endpoint: "",
  voiceId: null,
};

/**
 * STT de reference quand un LLM realtime rend le slot inutile (reference Web
 * `normalizeAsrConfig`, provider local distil-whisper, sans cle). `endpoint`
 * vide pour la meme raison que le TTS (pas d'endpoint reseau).
 */
export const REALTIME_STT_FALLBACK: ProviderSelection<SttProviderId> = {
  provider: "distil-whisper",
  model: "onnx-community/distil-small.en",
  endpoint: "",
  voiceId: null,
};

/**
 * Remplit les slots TTS/STT restes `"none"` par les defauts de reference quand
 * le LLM est realtime : le contrat wire exige toujours les trois slots, meme
 * si l'appliance ignore TTS/STT dans ce mode. Un slot deja configure (valeur
 * valide) est conserve ; un LLM non-realtime est retourne inchange.
 *
 * @param config configuration d'edition (peut contenir la sentinelle `"none"`).
 * @returns config envoyable sur le fil (jamais mutee).
 */
export function applyRealtimeVoiceDefaults(config: DeviceConfig): DeviceConfig {
  if (!isRealtimeVoiceProvider(config.providers.llm.provider)) return config;
  return {
    ...config,
    providers: {
      ...config.providers,
      tts:
        config.providers.tts.provider === UNCONFIGURED_PROVIDER
          ? REALTIME_TTS_FALLBACK
          : config.providers.tts,
      stt:
        config.providers.stt.provider === UNCONFIGURED_PROVIDER
          ? REALTIME_STT_FALLBACK
          : config.providers.stt,
    },
  };
}

/**
 * Serialise une configuration pour envoi au Desktop.
 *
 * Le payload ne contient QUE les champs du contrat (les champs inconnus de
 * l'objet source sont perdus volontairement) et aucune donnee secrete : le
 * type `DeviceConfig` n'en porte pas (D1).
 *
 * Garde « rien de pré-activé » : une config contenant un slot `"none"` est
 * VALIDE à l'édition mais ne doit JAMAIS partir sur le fil (l'appliance n'a
 * pas à gérer la sentinelle). Un LLM realtime fait exception : ses slots
 * TTS/STT `"none"` sont remplis par les defauts de reference avant la garde
 * (le contrat wire exige les trois slots).
 *
 * @param config configuration complete, supposee validee en amont.
 * @returns representation JSON stable, pret pour `POST /api/device-config`.
 * @throws si un slot provider requis est encore `"none"` (config non envoyable).
 */
export function serializeDeviceConfig(config: DeviceConfig): string {
  const wire = applyRealtimeVoiceDefaults(config);
  if (hasUnconfiguredProvider(wire)) {
    throw new Error(
      "refusing to serialize a config with an unconfigured provider (\"none\")"
    );
  }
  return JSON.stringify(wire);
}

/**
 * Deserialise une configuration depuis une chaine JSON (stockage local,
 * export/import, reponse Desktop).
 *
 * Comportement de compatibilite (PLAN.md 5.3) :
 * - une version differente de `DEVICE_CONFIG_VERSION` est refusee (retour
 *   `null`) ; il n'existe pas encore d'ancienne version a migrer : la
 *   migration propre est un reset vers les defauts par l'appelant ;
 * - les champs inconnus sont ignores par la validation ;
 * - une chaine corrompue ou invalide retourne `null` sans lever.
 *
 * @param raw chaine JSON a parser.
 * @returns configuration validee, ou `null` si non conforme.
 */
export function parseDeviceConfig(raw: string): DeviceConfig | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (
    typeof parsed !== "object" ||
    parsed === null ||
    (parsed as Record<string, unknown>).configVersion !== DEVICE_CONFIG_VERSION
  ) {
    // Version incompatible ou absente : refusee proprement, jamais corrigee
    // silencieusement — la version est une frontiere de contrat.
    return null;
  }
  const result = validateDeviceConfig(parsed);
  return result.ok ? result.config : null;
}

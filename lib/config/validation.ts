import { DEFAULT_AVATAR_POSE, DEFAULT_WAKE_WORD_CUE } from "./defaults";
import { findAnimationByUrl } from "../animations/catalog";
import {
  AVATAR_MOODS,
  CHARACTER_NAME_MAX_LENGTH,
  DEVICE_CONFIG_VERSION,
  GREETING_MAX_LENGTH,
  PERSONALITY_MAX_LENGTH,
  POSE_DEPTH_MAX,
  POSE_DEPTH_MIN,
  POSE_ZOOM_MAX,
  POSE_ZOOM_MIN,
  isRealtimeVoiceProvider,
  PRONOUNS,
  UNCONFIGURED_PROVIDER,
  WAKE_WORD_CUE_MAX_DURATION_MS,
  WAKE_WORD_CUE_MIN_DURATION_MS,
  WAKE_WORD_MODEL_IDS,
  type AvatarConfig,
  type AvatarMood,
  type AvatarPoseConfig,
  type CharacterConfig,
  type DeviceConfig,
  type EnvironmentConfig,
  type LlmProviderId,
  type Pronouns,
  type SttProviderId,
  type TtsProviderId,
  type WakeWordConfig,
  type WakeWordCueConfig,
  type WakeWordModel,
} from "../../types/config";

/**
 * Resultat de validation d'une configuration.
 *
 * - `ok: true` : `config` est une `DeviceConfig` complete, sans champ secret ;
 * - `ok: false` : `errors` liste les raisons exploitables, sans valeurs
 *   sensibles (il n'y en a de toute facon pas dans le contrat).
 */
export type DeviceConfigValidation =
  | { ok: true; config: DeviceConfig }
  | { ok: false; errors: string[] };

/** Motif de couleur d'alcove : hexadecimal `#rrggbb` minuscule strict (regle Web). */
const HEX_COLOR_PATTERN = /^#[0-9a-f]{6}$/;

const LLM_PROVIDER_IDS: readonly LlmProviderId[] = [
  UNCONFIGURED_PROVIDER,
  "anthropic",
  "openai",
  "openai-realtime",
  "openai-codex",
  "claude-cli",
  "google",
  "google-live",
  "xai",
  "mistral",
  "cerebras",
  "nvidia",
  "openrouter",
  "groq",
  "together",
  "fireworks",
  "qwen",
  "ollama",
  "lmstudio",
  "openclaw",
];

const TTS_PROVIDER_IDS: readonly TtsProviderId[] = [
  UNCONFIGURED_PROVIDER,
  "kokoro",
  "elevenlabs",
  "deepgram",
  "openai",
  "google",
  "xai",
  "deepinfra",
  "openrouter",
  "inworld",
  "minimax",
  "gradium",
  "vydra",
  "xiaomi",
  "azure-speech",
  "microsoft",
  "volcengine",
];

const STT_PROVIDER_IDS: readonly SttProviderId[] = [
  UNCONFIGURED_PROVIDER,
  "distil-whisper",
  "deepgram",
  "elevenlabs",
  "openai",
  "xai",
  "mistral",
];

/**
 * Valide une valeur inconnue comme configuration complete.
 *
 * Comportement :
 * - les champs inconnus sont ignores (politique de compatibilite, PLAN.md 5.3) ;
 * - un champ obligatoire manquant, mal type ou hors union fait echouer la
 *   validation avec une raison par champ ;
 * - aucun appel reseau ni acces disque : fonction pure, testable sans RN.
 *
 * @param value valeur a valider, typiquement issue de JSON.parse ou du
 *   reseau ; ne jamais lui faire confiance.
 * @returns configuration validee ou liste d'erreurs exploitables.
 */
export function validateDeviceConfig(value: unknown): DeviceConfigValidation {
  const errors: string[] = [];
  if (typeof value !== "object" || value === null) {
    return { ok: false, errors: ["config must be an object"] };
  }
  const v = value as Record<string, unknown>;

  if (v.configVersion !== DEVICE_CONFIG_VERSION) {
    errors.push(`configVersion must be "${DEVICE_CONFIG_VERSION}"`);
  }

  const character = validateCharacter(v.character);
  if (typeof character === "string") errors.push(character);

  const avatar = validateAvatar(v.avatar);
  if (typeof avatar === "string") errors.push(avatar);

  const environment = validateEnvironment(v.environment);
  if (typeof environment === "string") errors.push(environment);

  const wakeWord = validateWakeWord(v.wakeWord);
  if (typeof wakeWord === "string") errors.push(wakeWord);

  const providers = validateProviders(v.providers);
  if (typeof providers === "string") errors.push(providers);

  if (errors.length > 0) return { ok: false, errors };
  return {
    ok: true,
    config: {
      configVersion: DEVICE_CONFIG_VERSION,
      character: character as CharacterConfig,
      avatar: avatar as AvatarConfig,
      environment: environment as EnvironmentConfig,
      wakeWord: wakeWord as WakeWordConfig,
      providers: providers as DeviceConfig["providers"],
    },
  };
}

/**
 * Valide la section character : limites de longueur et union de pronoms.
 * @returns la config validee, ou une chaine decrivant l'erreur.
 */
function validateCharacter(value: unknown): CharacterConfig | string {
  if (typeof value !== "object" || value === null) return "character must be an object";
  const v = value as Record<string, unknown>;
  if (typeof v.name !== "string") return "character.name must be a string";
  const name = v.name.trim();
  if (name.length === 0) return "character.name must not be empty";
  if (name.length > CHARACTER_NAME_MAX_LENGTH) {
    return `character.name must be at most ${CHARACTER_NAME_MAX_LENGTH} characters`;
  }
  if (typeof v.pronouns !== "string" || !PRONOUNS.includes(v.pronouns as Pronouns)) {
    return "character.pronouns must be one of HE, SHE, THEY";
  }
  if (typeof v.personality !== "string") return "character.personality must be a string";
  if (v.personality.length > PERSONALITY_MAX_LENGTH) {
    return `character.personality must be at most ${PERSONALITY_MAX_LENGTH} characters`;
  }
  if (typeof v.greeting !== "string") return "character.greeting must be a string";
  if (v.greeting.length > GREETING_MAX_LENGTH) {
    return `character.greeting must be at most ${GREETING_MAX_LENGTH} characters`;
  }
  return {
    name,
    pronouns: v.pronouns as Pronouns,
    personality: v.personality,
    greeting: v.greeting,
  };
}

/**
 * Valide la section avatar : union de moods (ou null), reference VRM et pose
 * de presentation.
 *
 * Migration : `pose` absente (config stockee anterieure a la sous-phase 4.4)
 * est remplacee par les defauts ; une `pose` presente mais invalide fait
 * echouer la validation (champ present = champ soumis au contrat).
 *
 * @returns la config validee, ou une chaine decrivant l'erreur.
 */
function validateAvatar(value: unknown): AvatarConfig | string {
  if (typeof value !== "object" || value === null) return "avatar must be an object";
  const v = value as Record<string, unknown>;
  const mood = v.mood;
  if (
    mood !== null &&
    (typeof mood !== "string" || !AVATAR_MOODS.includes(mood as AvatarMood))
  ) {
    return `avatar.mood must be null or one of ${AVATAR_MOODS.join(", ")}`;
  }
  const modelRef = v.modelRef;
  if (typeof modelRef !== "object" || modelRef === null) return "avatar.modelRef must be an object";
  const m = modelRef as Record<string, unknown>;
  if (typeof m.id !== "string" || m.id.length === 0) return "avatar.modelRef.id must be a non-empty string";
  if (typeof m.fileName !== "string" || m.fileName.length === 0) {
    return "avatar.modelRef.fileName must be a non-empty string";
  }
  if (m.hash !== null && typeof m.hash !== "string") {
    return "avatar.modelRef.hash must be a string or null";
  }
  if (v.pose === undefined) {
    return {
      mood: mood as AvatarMood | null,
      modelRef: { id: m.id, fileName: m.fileName, hash: m.hash as string | null },
      pose: DEFAULT_AVATAR_POSE,
    };
  }
  const pose = validateAvatarPose(v.pose);
  if (typeof pose === "string") return pose;
  return {
    mood: mood as AvatarMood | null,
    modelRef: { id: m.id, fileName: m.fileName, hash: m.hash as string | null },
    pose,
  };
}

/**
 * Valide une pose de presentation : quatre nombres finis, zoom et profondeur
 * dans leurs bornes (`POSE_ZOOM_*`, `POSE_DEPTH_*`). Les yaws sont des
 * radians non bornes (rotation cumulee libre).
 * @returns la pose validee, ou une chaine decrivant l'erreur.
 */
function validateAvatarPose(value: unknown): AvatarPoseConfig | string {
  if (typeof value !== "object" || value === null) return "avatar.pose must be an object";
  const v = value as Record<string, unknown>;
  for (const key of ["avatarYaw", "alcoveYaw", "zoom", "depth"] as const) {
    if (typeof v[key] !== "number" || !Number.isFinite(v[key])) {
      return `avatar.pose.${key} must be a finite number`;
    }
  }
  const zoom = v.zoom as number;
  if (zoom < POSE_ZOOM_MIN || zoom > POSE_ZOOM_MAX) {
    return `avatar.pose.zoom must be between ${POSE_ZOOM_MIN} and ${POSE_ZOOM_MAX}`;
  }
  const depth = v.depth as number;
  if (depth < POSE_DEPTH_MIN || depth > POSE_DEPTH_MAX) {
    return `avatar.pose.depth must be between ${POSE_DEPTH_MIN} and ${POSE_DEPTH_MAX}`;
  }
  return {
    avatarYaw: v.avatarYaw as number,
    alcoveYaw: v.alcoveYaw as number,
    zoom,
    depth,
  };
}

/**
 * Valide la section environment : couleur hexadecimale minuscule ou null.
 * @returns la config validee, ou une chaine decrivant l'erreur.
 */
function validateEnvironment(value: unknown): EnvironmentConfig | string {
  if (typeof value !== "object" || value === null) return "environment must be an object";
  const v = value as Record<string, unknown>;
  const color = v.alcoveColor;
  if (color !== null && (typeof color !== "string" || !HEX_COLOR_PATTERN.test(color))) {
    return "environment.alcoveColor must be a lowercase #rrggbb hex color or null";
  }
  return { alcoveColor: color as string | null };
}

/**
 * Valide le bloc `wakeWord` (protocole 18/09/2026) : modele de l'union ou
 * `null`, plus la confirmation visuelle `cue`. Bloc additif et optionnel :
 * absent (config stockee anterieure) est migre vers les defauts,
 * `configVersion` inchangee. Un bloc present avec un `model` hors union fait
 * echouer la validation (champ present = champ soumis au contrat).
 *
 * `cue` est lui aussi additif et optionnel : absent d'une config stockee
 * anterieure, il est remplace par les defauts ; present, chacun de ses champs
 * est exige et valide (champ present = champ soumis au contrat).
 *
 * @returns la config validee, ou une chaine decrivant l'erreur.
 */
function validateWakeWord(value: unknown): WakeWordConfig | string {
  if (value === undefined) return { model: null, cue: DEFAULT_WAKE_WORD_CUE };
  if (typeof value !== "object" || value === null) return "wakeWord must be an object";
  const v = value as Record<string, unknown>;
  const model = v.model;
  if (
    model !== null &&
    !(WAKE_WORD_MODEL_IDS as readonly string[]).includes(model as string)
  ) {
    return `wakeWord.model must be null or one of ${WAKE_WORD_MODEL_IDS.join(", ")}`;
  }
  const cue = validateWakeWordCue(v.cue);
  if (typeof cue === "string") return cue;
  return { model: model as WakeWordModel | null, cue };
}

/**
 * Valide la confirmation visuelle du wake word.
 *
 * Migration : `cue` absent (config stockee anterieure au 18/09/2026) est
 * remplace par les defauts. Present mais incomplet ou invalide, il fait
 * echouer la validation : couleur `#rrggbb` minuscule stricte, duree entiere
 * dans `[300, 3000]`, animation appartenant au catalogue.
 *
 * @returns la cue validee, ou une chaine decrivant l'erreur.
 */
function validateWakeWordCue(value: unknown): WakeWordCueConfig | string {
  if (value === undefined) return DEFAULT_WAKE_WORD_CUE;
  if (typeof value !== "object" || value === null) return "wakeWord.cue must be an object";
  const v = value as Record<string, unknown>;
  if (typeof v.flashColor !== "string" || !HEX_COLOR_PATTERN.test(v.flashColor)) {
    return "wakeWord.cue.flashColor must be a lowercase #rrggbb hex color";
  }
  if (
    typeof v.blinkDurationMs !== "number" ||
    !Number.isInteger(v.blinkDurationMs) ||
    v.blinkDurationMs < WAKE_WORD_CUE_MIN_DURATION_MS ||
    v.blinkDurationMs > WAKE_WORD_CUE_MAX_DURATION_MS
  ) {
    return `wakeWord.cue.blinkDurationMs must be an integer between ${WAKE_WORD_CUE_MIN_DURATION_MS} and ${WAKE_WORD_CUE_MAX_DURATION_MS}`;
  }
  if (
    typeof v.animationUrl !== "string" ||
    findAnimationByUrl(v.animationUrl) === undefined
  ) {
    return "wakeWord.cue.animationUrl must be a known animation url";
  }
  return {
    flashColor: v.flashColor,
    blinkDurationMs: v.blinkDurationMs,
    animationUrl: v.animationUrl,
  };
}

/**
 * Valide la section providers : les trois slots doivent referencer des ids
 * de leurs unions respectives, avec un modele non vide.
 * @returns la config validee, ou une chaine decrivant l'erreur.
 */
function validateProviders(value: unknown): DeviceConfig["providers"] | string {
  if (typeof value !== "object" || value === null) return "providers must be an object";
  const v = value as Record<string, unknown>;
  const llm = validateSelection(v.llm, LLM_PROVIDER_IDS, "providers.llm");
  if (typeof llm === "string") return llm;
  const tts = validateSelection(v.tts, TTS_PROVIDER_IDS, "providers.tts");
  if (typeof tts === "string") return tts;
  const stt = validateSelection(v.stt, STT_PROVIDER_IDS, "providers.stt");
  if (typeof stt === "string") return stt;
  return { llm, tts, stt };
}

/**
 * Valide une selection de provider contre l'union de son slot.
 *
 * Sentinelle `"none"` : slot non configuré. Accepté sans exiger
 * model/endpoint/voiceId (normalisés à `""`/`null`/`null`) ; c'est un état
 * d'édition valide, jamais envoyable (`serializeDeviceConfig` le refuse).
 *
 * @param path chemin du slot dans les messages d'erreur.
 * @param allowedIds identifiants valides pour ce slot.
 * @returns la selection validee, ou une chaine decrivant l'erreur.
 */
function validateSelection<P extends string>(
  value: unknown,
  allowedIds: readonly P[],
  path: string
): { provider: P; model: string; endpoint: string | null; voiceId: string | null } | string {
  if (typeof value !== "object" || value === null) return `${path} must be an object`;
  const v = value as Record<string, unknown>;
  if (typeof v.provider !== "string" || !allowedIds.includes(v.provider as P)) {
    return `${path}.provider must be one of ${allowedIds.join(", ")}`;
  }
  const provider = v.provider as P;
  if (provider === UNCONFIGURED_PROVIDER) {
    return { provider, model: "", endpoint: null, voiceId: null };
  }
  if (typeof v.model !== "string" || v.model.length === 0) {
    return `${path}.model must be a non-empty string`;
  }
  if (v.endpoint !== null && typeof v.endpoint !== "string") {
    return `${path}.endpoint must be a string or null`;
  }
  if (v.voiceId !== null && typeof v.voiceId !== "string") {
    return `${path}.voiceId must be a string or null`;
  }
  return {
    provider,
    model: v.model,
    endpoint: v.endpoint as string | null,
    voiceId: v.voiceId as string | null,
  };
}

/**
 * Indique si au moins un slot provider est encore non configuré (`"none"`).
 *
 * Une telle config est VALIDE pour l'édition mais NON ENVOYABLE : l'écran
 * review s'en sert pour bloquer l'envoi et `serializeDeviceConfig` pour la
 * refuser (défense en profondeur).
 *
 * Exception realtime (protocole 18/09/2026) : quand `llm.provider` est
 * realtime (`openai-realtime`/`google-live`), la voix couvre TTS et STT ;
 * ces deux slots sont ignores par l'appliance et ne bloquent donc plus
 * l'envoi. Seul le slot LLM reste exige.
 *
 * @param config configuration (validee ou non).
 */
export function hasUnconfiguredProvider(config: DeviceConfig): boolean {
  const slots = isRealtimeVoiceProvider(config.providers.llm.provider)
    ? (["llm"] as const)
    : (["llm", "tts", "stt"] as const);
  return slots.some(
    (slot) => config.providers[slot].provider === UNCONFIGURED_PROVIDER
  );
}

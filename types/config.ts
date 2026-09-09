/**
 * Contrat de configuration Mobile <-> Electron (PLAN.md section 5).
 *
 * Compatibilite :
 * - `configVersion` est obligatoire dans tout payload envoye au Desktop ;
 * - les champs inconnus sont ignores par le Desktop et par ce module ;
 * - les secrets (cles API, token de pairing) n'appartiennent JAMAIS a ces
 *   types. Decision D1 (08/09/2026) : saisie possible sur Mobile puis
 *   transfert unique authentifie vers Electron, sans persistance sur Mobile ;
 *   le Desktop ne renvoie que des statuts masques.
 */

/** Version du format de configuration envoye au Desktop. */
export const DEVICE_CONFIG_VERSION = "1.0" as const;

/** Type de la version de configuration supportee par cette application. */
export type DeviceConfigVersion = typeof DEVICE_CONFIG_VERSION;

/** Pronoms disponibles, alignes sur `liteforms-web` (`CharacterConfigStore`). */
export type Pronouns = "HE" | "SHE" | "THEY";

/** Liste exhaustive des pronoms valides, pour validation et UI. */
export const PRONOUNS: readonly Pronouns[] = ["HE", "SHE", "THEY"];

/**
 * Humeurs du preview mobile, alignees sur `liteforms-web`
 * (`VALID_MOOD_PRESETS`). `null` signifie "humeur par defaut du Desktop".
 */
export type AvatarMood = "happy" | "sad" | "angry" | "surprised" | "relaxed";

/** Liste exhaustive des humeurs valides, pour validation et UI. */
export const AVATAR_MOODS: readonly AvatarMood[] = [
  "happy",
  "sad",
  "angry",
  "surprised",
  "relaxed",
];

/**
 * Providers LLM configurables, alignes sur le catalogue Web
 * (`LLM_PROVIDER_OPTIONS`). Les providers d'execution navigateur
 * (`browser-local-qwen`, `browser-local-gemma`) sont exclus : seul le
 * Desktop execute, ils ne peuvent pas y fonctionner.
 */
export type LlmProviderId =
  | "anthropic"
  | "openai"
  | "openai-realtime"
  | "openai-codex"
  | "claude-cli"
  | "google"
  | "google-live"
  | "xai"
  | "mistral"
  | "cerebras"
  | "nvidia"
  | "openrouter"
  | "groq"
  | "together"
  | "fireworks"
  | "qwen"
  | "ollama"
  | "lmstudio"
  | "openclaw";

/** Providers TTS configurables, alignes sur le catalogue Web (`TTS_PROVIDER_OPTIONS`). */
export type TtsProviderId =
  | "kokoro"
  | "elevenlabs"
  | "deepgram"
  | "openai"
  | "google"
  | "xai"
  | "deepinfra"
  | "openrouter"
  | "inworld"
  | "minimax"
  | "gradium"
  | "vydra"
  | "xiaomi"
  | "azure-speech"
  | "microsoft"
  | "volcengine";

/** Providers STT configurables, alignes sur le catalogue Web (`STT_PROVIDER_OPTIONS`). */
export type SttProviderId =
  | "distil-whisper"
  | "deepgram"
  | "elevenlabs"
  | "openai"
  | "xai"
  | "mistral";

/**
 * Selection d'un provider pour un slot donne.
 *
 * Contraintes :
 * - `model` est obligatoire (le Desktop doit savoir quoi executer) ;
 * - `endpoint` : `null` = endpoint par defaut du provider ;
 * - `voiceId` : pertinent surtout pour TTS ; `null` = voix par defaut.
 *
 * Conformement a D1, aucun champ de credential n'existe dans ce type.
 */
export type ProviderSelection<P extends string = string> = {
  /** Identifiant du provider (union par slot : LLM, TTS ou STT). */
  provider: P;
  /** Identifiant du modele chez ce provider. */
  model: string;
  /** URL de base personnalisee, ou `null` pour l'endpoint par defaut. */
  endpoint: string | null;
  /** Voix selectionnee (TTS notamment), ou `null` pour la defaut. */
  voiceId: string | null;
};

/**
 * Identite de l'avatar configuree par l'utilisateur.
 *
 * Limites de longueur (Mobile uniquement ; le Web n'en definit pas) :
 * - `name` : 1 a 40 caracteres apres trim ;
 * - `personality` : 0 a 1000 caracteres ;
 * - `greeting` : 0 a 500 caracteres.
 * Le Desktop reste autorite sur des regles plus strictes eventuelles.
 */
export type CharacterConfig = {
  /** Nom affiche de l'avatar. */
  name: string;
  /** Pronoms de l'avatar. */
  pronouns: Pronouns;
  /** Description de personnalite libre injectee dans les prompts Desktop. */
  personality: string;
  /** Phrase d'accueil prononcee a l'ouverture de session. */
  greeting: string;
};

/** Longueur maximale du nom d'avatar. */
export const CHARACTER_NAME_MAX_LENGTH = 40;
/** Longueur maximale de la description de personnalite. */
export const PERSONALITY_MAX_LENGTH = 1000;
/** Longueur maximale de la phrase d'accueil. */
export const GREETING_MAX_LENGTH = 500;

/**
 * Reference stable d'un modele VRM (decision D2 : le Desktop reste
 * proprietaire du catalogue d'execution ; le Mobile ne reference que
 * l'identifiant, jamais le binaire).
 */
export type VrmModelRef = {
  /** Identifiant stable du modele dans le catalogue Desktop. */
  id: string;
  /** Nom de fichier du modele, a des fins d'affichage et de diagnostic. */
  fileName: string;
  /**
   * Empreinte du modele lorsque le contrat Desktop en fournit une ;
   * `null` tant que le protocole ne l'exige pas (D2/D4).
   */
  hash: string | null;
};

/** Zoom camera minimal : dezoom maximal (distance multipliee par 1/min). */
export const POSE_ZOOM_MIN = 0.5;
/** Zoom camera maximal : rapprochement maximal de la camera. */
export const POSE_ZOOM_MAX = 2.5;
/** Profondeur minimale de l'avatar : recul maximal dans l'alcove (unites monde). */
export const POSE_DEPTH_MIN = -0.25;
/** Profondeur maximale de l'avatar : avancement maximal vers la camera. */
export const POSE_DEPTH_MAX = 0.25;

/**
 * Pose de presentation de l'avatar dans l'alcove (decision produit du
 * 09/09/2026 : parametres du previewSauvegardes puis transmissibles au
 * Desktop, qui les rejouera dans son rendu Looking Glass).
 *
 * Unites :
 * - yaws en radians, RELATIFS a l'orientation naturelle du modele (apres
 *   correction VRM 0.x) : 0 = face camera, cumul des gestes de rotation ;
 * - `zoom` : multiplicateur de la distance de cadrage (1 = cadrage par
 *   defaut) ; borne par POSE_ZOOM_MIN/MAX ;
 * - `depth` : decalage de l'avatar le long de l'axe camera, en unites
 *   monde, borne par POSE_DEPTH_MIN/MAX.
 */
export type AvatarPoseConfig = {
  /** Rotation horizontale cumulee de l'avatar, en radians relatifs. */
  avatarYaw: number;
  /** Rotation horizontale cumulee de l'alcove, en radians relatifs. */
  alcoveYaw: number;
  /** Multiplicateur de distance camera, sans unite. */
  zoom: number;
  /** Decalage de profondeur de l'avatar, en unites monde. */
  depth: number;
};

/** Configuration de l'avatar : humeur, modele VRM et pose de presentation. */
export type AvatarConfig = {
  /** Humeur du preview, ou `null` pour la defaut du Desktop. */
  mood: AvatarMood | null;
  /** Reference du modele VRM a utiliser. */
  modelRef: VrmModelRef;
  /**
   * Pose de presentation (rotation, zoom, profondeur). Absente dans les
   * configs stockees anterieures : la validation la remplace par les
   * defauts (chemin de migration, configVersion 1.0 inchangee).
   */
  pose: AvatarPoseConfig;
};

/**
 * Configuration d'environnement. Le Mobile ne definit aujourd'hui que la
 * couleur de l'alcove, format `#rrggbb` minuscule strict (regle Web) ;
 * `null` laisse le Desktop appliquer sa couleur par defaut.
 */
export type EnvironmentConfig = {
  /** Couleur de l'alcove en hexadecimal `#rrggbb` minuscule, ou `null`. */
  alcoveColor: string | null;
};

/** Configuration complete, ordinaire et non secrete, envoyee au Desktop. */
export type DeviceConfig = {
  /** Version du format de configuration, toujours `DEVICE_CONFIG_VERSION`. */
  configVersion: DeviceConfigVersion;
  /** Identite de l'avatar. */
  character: CharacterConfig;
  /** Humeur et modele VRM. */
  avatar: AvatarConfig;
  /** Environnement (alcove). */
  environment: EnvironmentConfig;
  /** Selections providers par slot. */
  providers: {
    /** Slot LLM. */
    llm: ProviderSelection<LlmProviderId>;
    /** Slot TTS. */
    tts: ProviderSelection<TtsProviderId>;
    /** Slot STT. */
    stt: ProviderSelection<SttProviderId>;
  };
};

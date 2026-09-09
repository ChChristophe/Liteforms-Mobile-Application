import type { AvatarPoseConfig, DeviceConfig } from "../../types/config";

/**
 * Pose de presentation par defaut : modele face camera, cadrage de reference,
 * avatar dans son plan d'origine. Doit passer `validateDeviceConfig`.
 */
export const DEFAULT_AVATAR_POSE: AvatarPoseConfig = {
  avatarYaw: 0,
  alcoveYaw: 0,
  zoom: 1,
  depth: 0,
};

/**
 * Valeurs par defaut de la configuration.
 *
 * Sources :
 * - character : exemple canonique du PLAN.md (section 5.1) ;
 * - providers : defauts des catalogues Web actuels
 *   (`lib/llm/providerOptions.ts`, `lib/speech/providerOptions.ts`) ;
 * - modelRef : modele de reference du projet (POC historique, D2).
 *
 * Ces valeurs doivent toujours passer `validateDeviceConfig` : une config
 * par defaut invalide ferait echouer la gate "une configuration invalide ne
 * passe pas le store".
 */
export const DEFAULT_DEVICE_CONFIG: DeviceConfig = {
  configVersion: "1.0",
  character: {
    name: "Clawdia",
    pronouns: "SHE",
    personality: "",
    greeting: "",
  },
  avatar: {
    mood: "happy",
    modelRef: {
      id: "lobsterEdit",
      fileName: "lobsterEdit.vrm",
      hash: null,
    },
    pose: DEFAULT_AVATAR_POSE,
  },
  environment: {
    alcoveColor: "#4a90d9",
  },
  providers: {
    llm: {
      provider: "openai",
      model: "gpt-5.5",
      endpoint: "https://api.openai.com/v1",
      voiceId: null,
    },
    tts: {
      provider: "elevenlabs",
      model: "eleven_flash_v2_5",
      endpoint: "https://api.elevenlabs.io/v1",
      voiceId: "CwhRBWXzGAHq8TQ4Fs17",
    },
    stt: {
      provider: "deepgram",
      model: "nova-3",
      endpoint: "https://api.deepgram.com/v1",
      voiceId: null,
    },
  },
};

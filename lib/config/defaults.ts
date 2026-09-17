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
 * - providers : « rien de pré-activé » (décision 17/09/2026) — les trois
 *   slots démarrent à `"none"`, l'utilisateur choisit explicitement ;
 * - modelRef : modele de reference du projet (POC historique, D2).
 *
 * Ces valeurs doivent toujours passer `validateDeviceConfig` : une config
 * par defaut invalide ferait echouer la gate "une configuration invalide ne
 * passe pas le store". (Une config avec `"none"` est VALIDE mais non
 * envoyable : `serializeDeviceConfig` la refuse.)
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
      provider: "none",
      model: "",
      endpoint: null,
      voiceId: null,
    },
    tts: {
      provider: "none",
      model: "",
      endpoint: null,
      voiceId: null,
    },
    stt: {
      provider: "none",
      model: "",
      endpoint: null,
      voiceId: null,
    },
  },
};

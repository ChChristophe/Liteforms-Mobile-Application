import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Le reset doit renvoyer la reference propre de l'appliance : zoom=1 est
 * RELATIF a son cadrage par defaut, jamais une magnitude reglee pour le
 * telephone (exigence produit, `protocol/DEVICE_API.md` §Bloc `avatar.pose`).
 *
 * AvatarPreview n'est pas montable ici : aucun renderer RN n'est installe
 * (ni react-test-renderer ni @testing-library) et GLView/expo-gl/three sont
 * des dependances natives lourdes. Ce test reproduit donc l'appel EXACT de
 * `resetPose` (AvatarPreview l.158-160) et verrouille la pose neutre telle
 * qu'elle part dans `POST /api/device-config`.
 */
vi.mock("../../lib/storage/configStorage", () => ({
  CONFIG_STORAGE_KEY: "liteforms.deviceConfig",
  loadStoredDeviceConfig: vi.fn(),
  saveStoredDeviceConfig: vi.fn().mockResolvedValue(undefined),
  clearStoredDeviceConfig: vi.fn().mockResolvedValue(undefined),
}));

import { DEFAULT_AVATAR_POSE } from "../../lib/config/defaults";
import {
  parseDeviceConfig,
  serializeDeviceConfig,
} from "../../lib/config/serialization";
import { useConfigStore } from "../../stores/configStore";

describe("AvatarPreview « Réinitialiser »", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Config envoyable : providers reels (le round-trip wire refuse la
    // sentinelle "none" des defauts — test isole de la config providers).
    useConfigStore.getState().updateProvider("llm", {
      provider: "openai", model: "gpt-5.5", endpoint: null, voiceId: null,
    });
    useConfigStore.getState().updateProvider("tts", {
      provider: "elevenlabs", model: "flash", endpoint: null, voiceId: null,
    });
    useConfigStore.getState().updateProvider("stt", {
      provider: "deepgram", model: "nova-3", endpoint: null, voiceId: null,
    });
    // Pose non neutre issue d'un reglage utilisateur (bornes du contrat).
    useConfigStore.getState().updateAvatar({
      pose: { avatarYaw: 1.2, alcoveYaw: -0.4, zoom: 2.1, depth: 0.2 },
    });
  });

  it("apres reset, la config porte la pose neutre du contrat et elle survit au round-trip du payload", () => {
    // Appel identique a `resetPose` d'AvatarPreview.
    useConfigStore.getState().updateAvatar({ pose: DEFAULT_AVATAR_POSE });

    // Literaux du contrat : un changement de DEFAULT_AVATAR_POSE casse ici.
    expect(useConfigStore.getState().config.avatar.pose).toEqual({
      avatarYaw: 0,
      alcoveYaw: 0,
      zoom: 1,
      depth: 0,
    });

    // Valeur reellement envoyee par POST /api/device-config.
    const payload = parseDeviceConfig(
      serializeDeviceConfig(useConfigStore.getState().config)
    );
    expect(payload?.avatar.pose).toEqual({
      avatarYaw: 0,
      alcoveYaw: 0,
      zoom: 1,
      depth: 0,
    });
  });
});

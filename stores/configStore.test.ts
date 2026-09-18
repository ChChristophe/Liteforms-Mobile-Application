import { beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_DEVICE_CONFIG } from "../lib/config/defaults";
import type { DeviceConfig } from "../types/config";

/**
 * Le module AsyncStorage n'existe pas hors RN : la couche storage est
 * mockee pour tester la logique du store en Node pur.
 */
vi.mock("../lib/storage/configStorage", () => ({
  CONFIG_STORAGE_KEY: "liteforms.deviceConfig",
  loadStoredDeviceConfig: vi.fn(),
  saveStoredDeviceConfig: vi.fn().mockResolvedValue(undefined),
  clearStoredDeviceConfig: vi.fn().mockResolvedValue(undefined),
}));

import {
  loadStoredDeviceConfig,
  saveStoredDeviceConfig,
} from "../lib/storage/configStorage";
import { useConfigStore } from "./configStore";
import {
  BUNDLED_ANIMATION_FILE_NAME,
  findAnimationEntry,
  wakeWordCueAnimationUrlFor,
} from "../lib/animations/catalog";

const mockLoad = vi.mocked(loadStoredDeviceConfig);
const mockSave = vi.mocked(saveStoredDeviceConfig);

/** Config "stockee" arbitraire pour verifier qu'elle remplace les defauts. */
const STORED: DeviceConfig = {
  ...DEFAULT_DEVICE_CONFIG,
  character: { name: "Nova", pronouns: "THEY", personality: "curious", greeting: "Hi" },
  environment: { alcoveColor: "#ff0000" },
};

beforeEach(() => {
  vi.clearAllMocks();
  mockSave.mockResolvedValue(undefined);
  useConfigStore.setState({ config: DEFAULT_DEVICE_CONFIG, hydrated: false });
});

describe("configStore.hydrate", () => {
  it("adopts a valid stored configuration", async () => {
    mockLoad.mockResolvedValueOnce(STORED);
    await useConfigStore.getState().hydrate();
    expect(useConfigStore.getState().config).toEqual(STORED);
    expect(useConfigStore.getState().hydrated).toBe(true);
  });

  it("falls back to defaults when nothing is stored", async () => {
    mockLoad.mockResolvedValueOnce(null);
    await useConfigStore.getState().hydrate();
    expect(useConfigStore.getState().config).toEqual(DEFAULT_DEVICE_CONFIG);
    expect(useConfigStore.getState().hydrated).toBe(true);
  });

  it("is idempotent: a second hydrate does not re-read storage", async () => {
    mockLoad.mockResolvedValue(null);
    await useConfigStore.getState().hydrate();
    await useConfigStore.getState().hydrate();
    expect(mockLoad).toHaveBeenCalledTimes(1);
  });

  it("never persists during hydration (read-only path)", async () => {
    mockLoad.mockResolvedValueOnce(STORED);
    await useConfigStore.getState().hydrate();
    expect(mockSave).not.toHaveBeenCalled();
  });
});

describe("configStore mutations", () => {
  it("updateCharacter patches the section and persists the result", () => {
    useConfigStore.getState().updateCharacter({ name: "Rex" });
    const state = useConfigStore.getState();
    expect(state.config.character.name).toBe("Rex");
    expect(state.config.character.pronouns).toBe(DEFAULT_DEVICE_CONFIG.character.pronouns);
    expect(mockSave).toHaveBeenCalledTimes(1);
    expect(mockSave).toHaveBeenCalledWith(state.config);
  });

  it("updateProvider patches only the targeted slot", () => {
    useConfigStore.getState().updateProvider("tts", { model: "eleven_turbo_v2_5" });
    const { providers } = useConfigStore.getState().config;
    expect(providers.tts.model).toBe("eleven_turbo_v2_5");
    expect(providers.llm).toEqual(DEFAULT_DEVICE_CONFIG.providers.llm);
    expect(providers.stt).toEqual(DEFAULT_DEVICE_CONFIG.providers.stt);
  });

  it("updateWakeWord patches the section and persists", () => {
    useConfigStore.getState().updateWakeWord({ model: "hey_mycroft" });
    expect(useConfigStore.getState().config.wakeWord.model).toBe("hey_mycroft");
    expect(mockSave).toHaveBeenCalledTimes(1);
  });

  it("updateWakeWordCue patches one cue field and keeps the others", () => {
    useConfigStore.getState().updateWakeWordCue({ blinkDurationMs: 1500 });
    const { cue } = useConfigStore.getState().config.wakeWord;
    expect(cue.blinkDurationMs).toBe(1500);
    expect(cue.flashColor).toBe(DEFAULT_DEVICE_CONFIG.wakeWord.cue.flashColor);
    expect(cue.animationUrl).toBe(DEFAULT_DEVICE_CONFIG.wakeWord.cue.animationUrl);
    expect(mockSave).toHaveBeenCalledTimes(1);
  });

  it("selection d'une animation non-idle dans le preview persiste la cue", () => {
    // Chemin exact de `selectAnimation` (app/(setup)/avatar-preview.tsx).
    const entry = findAnimationEntry("Greeting.vrma")!;
    const url = wakeWordCueAnimationUrlFor(entry);
    if (url !== null) useConfigStore.getState().updateWakeWordCue({ animationUrl: url });
    expect(useConfigStore.getState().config.wakeWord.cue.animationUrl).toBe(
      "/animations/Greeting.vrma"
    );
  });

  it("selection de l'idle dans le preview ne change pas la cue", () => {
    useConfigStore.getState().updateWakeWordCue({ animationUrl: "/animations/Spin.vrma" });
    const idle = findAnimationEntry(BUNDLED_ANIMATION_FILE_NAME)!;
    const url = wakeWordCueAnimationUrlFor(idle);
    if (url !== null) useConfigStore.getState().updateWakeWordCue({ animationUrl: url });
    expect(useConfigStore.getState().config.wakeWord.cue.animationUrl).toBe(
      "/animations/Spin.vrma"
    );
  });

  it("resetConfig restores defaults and persists", () => {
    useConfigStore.getState().updateCharacter({ name: "Rex" });
    useConfigStore.getState().resetConfig();
    expect(useConfigStore.getState().config).toEqual(DEFAULT_DEVICE_CONFIG);
    expect(mockSave).toHaveBeenCalledTimes(2);
  });
});

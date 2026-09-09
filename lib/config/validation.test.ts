import { describe, expect, it } from "vitest";
import { DEFAULT_DEVICE_CONFIG } from "./defaults";
import { validateDeviceConfig } from "./validation";
import { DEVICE_CONFIG_VERSION } from "../../types/config";

describe("validateDeviceConfig", () => {
  it("accepts the default configuration", () => {
    const result = validateDeviceConfig(DEFAULT_DEVICE_CONFIG);
    expect(result).toEqual({ ok: true, config: DEFAULT_DEVICE_CONFIG });
  });

  it("rejects non-object input", () => {
    expect(validateDeviceConfig("nope").ok).toBe(false);
    expect(validateDeviceConfig(null).ok).toBe(false);
  });

  it("rejects a missing or wrong configVersion", () => {
    const bad = { ...DEFAULT_DEVICE_CONFIG, configVersion: "0.9" };
    expect(validateDeviceConfig(bad).ok).toBe(false);
    const missing: Record<string, unknown> = { ...DEFAULT_DEVICE_CONFIG };
    delete missing.configVersion;
    expect(validateDeviceConfig(missing).ok).toBe(false);
  });

  it("rejects an empty or oversized character name", () => {
    const empty = { ...DEFAULT_DEVICE_CONFIG, character: { ...DEFAULT_DEVICE_CONFIG.character, name: "   " } };
    expect(validateDeviceConfig(empty).ok).toBe(false);
    const oversized = {
      ...DEFAULT_DEVICE_CONFIG,
      character: { ...DEFAULT_DEVICE_CONFIG.character, name: "x".repeat(41) },
    };
    expect(validateDeviceConfig(oversized).ok).toBe(false);
  });

  it("rejects pronouns outside the union", () => {
    const bad = {
      ...DEFAULT_DEVICE_CONFIG,
      character: { ...DEFAULT_DEVICE_CONFIG.character, pronouns: "XE" },
    };
    expect(validateDeviceConfig(bad).ok).toBe(false);
  });

  it("rejects moods outside the union", () => {
    const bad = {
      ...DEFAULT_DEVICE_CONFIG,
      avatar: { ...DEFAULT_DEVICE_CONFIG.avatar, mood: "sleepy" },
    };
    expect(validateDeviceConfig(bad).ok).toBe(false);
  });

  it("accepts null mood and null alcoveColor (Desktop defaults)", () => {
    const nulls = {
      ...DEFAULT_DEVICE_CONFIG,
      avatar: { ...DEFAULT_DEVICE_CONFIG.avatar, mood: null },
      environment: { alcoveColor: null },
    };
    expect(validateDeviceConfig(nulls).ok).toBe(true);
  });

  it("rejects uppercase hex colors (web rule is lowercase #rrggbb)", () => {
    const bad = {
      ...DEFAULT_DEVICE_CONFIG,
      environment: { alcoveColor: "#4A90D9" },
    };
    expect(validateDeviceConfig(bad).ok).toBe(false);
  });

  it("rejects provider ids outside the slot union and empty models", () => {
    const badProvider = {
      ...DEFAULT_DEVICE_CONFIG,
      providers: {
        ...DEFAULT_DEVICE_CONFIG.providers,
        llm: { ...DEFAULT_DEVICE_CONFIG.providers.llm, provider: "browser-local-qwen" },
      },
    };
    expect(validateDeviceConfig(badProvider).ok).toBe(false);
    const emptyModel = {
      ...DEFAULT_DEVICE_CONFIG,
      providers: {
        ...DEFAULT_DEVICE_CONFIG.providers,
        stt: { ...DEFAULT_DEVICE_CONFIG.providers.stt, model: "" },
      },
    };
    expect(validateDeviceConfig(emptyModel).ok).toBe(false);
  });

  it("ignores unknown fields (compatibility policy)", () => {
    const extra = { ...(DEFAULT_DEVICE_CONFIG as object), futureField: 42 };
    const result = validateDeviceConfig(extra);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.config).toEqual(DEFAULT_DEVICE_CONFIG);
    }
  });

  it("trims the character name", () => {
    const padded = {
      ...DEFAULT_DEVICE_CONFIG,
      character: { ...DEFAULT_DEVICE_CONFIG.character, name: "  Clawdia  " },
    };
    const result = validateDeviceConfig(padded);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.config.character.name).toBe("Clawdia");
  });

  it("fills missing avatar.pose with defaults (stored-config migration)", () => {
    // Config stockee anterieure a la sous-phase 4.4 : pas de `pose`.
    const legacy = { ...DEFAULT_DEVICE_CONFIG };
    const { pose: _dropped, ...avatarWithoutPose } = DEFAULT_DEVICE_CONFIG.avatar;
    legacy.avatar = avatarWithoutPose as typeof DEFAULT_DEVICE_CONFIG.avatar;
    const result = validateDeviceConfig(legacy);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.config.avatar.pose).toEqual(DEFAULT_DEVICE_CONFIG.avatar.pose);
    }
  });

  it("rejects a pose with an out-of-range zoom", () => {
    const bad = {
      ...DEFAULT_DEVICE_CONFIG,
      avatar: { ...DEFAULT_DEVICE_CONFIG.avatar, pose: { ...DEFAULT_DEVICE_CONFIG.avatar.pose, zoom: 9 } },
    };
    expect(validateDeviceConfig(bad).ok).toBe(false);
  });

  it("rejects a pose with an out-of-range depth", () => {
    const bad = {
      ...DEFAULT_DEVICE_CONFIG,
      avatar: { ...DEFAULT_DEVICE_CONFIG.avatar, pose: { ...DEFAULT_DEVICE_CONFIG.avatar.pose, depth: 5 } },
    };
    expect(validateDeviceConfig(bad).ok).toBe(false);
  });

  it("rejects a pose with a non-finite yaw", () => {
    const bad = {
      ...DEFAULT_DEVICE_CONFIG,
      avatar: {
        ...DEFAULT_DEVICE_CONFIG.avatar,
        pose: { ...DEFAULT_DEVICE_CONFIG.avatar.pose, avatarYaw: Number.NaN },
      },
    };
    expect(validateDeviceConfig(bad).ok).toBe(false);
  });

  it("keeps the contract version constant stable", () => {
    expect(DEVICE_CONFIG_VERSION).toBe("1.0");
  });
});

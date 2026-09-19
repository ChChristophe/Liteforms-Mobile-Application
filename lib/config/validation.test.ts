import { describe, expect, it } from "vitest";
import { DEFAULT_DEVICE_CONFIG, DEFAULT_WAKE_WORD_CUE } from "./defaults";
import { hasUnconfiguredProvider, validateDeviceConfig } from "./validation";
import {
  DEVICE_CONFIG_VERSION,
  WAKE_WORD_CUE_DEFAULT_ANIMATION_URL,
  WAKE_WORD_CUE_DEFAULT_DURATION_MS,
  WAKE_WORD_CUE_FLASH_COLOR,
  WAKE_WORD_MODEL_IDS,
  type DeviceConfig,
} from "../../types/config";

/** Config dont seul le slot LLM est renseigne (tts/stt restent "none"). */
function realtimeWithEmptySpeech(provider: "openai-realtime" | "google-live"): DeviceConfig {
  return {
    ...DEFAULT_DEVICE_CONFIG,
    providers: {
      ...DEFAULT_DEVICE_CONFIG.providers,
      llm: { provider, model: "m", endpoint: "wss://e", voiceId: "coral" },
    },
  };
}

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

  it("starts without a wake word and the default cue (rien de pré-activé)", () => {
    expect(DEFAULT_DEVICE_CONFIG.wakeWord).toEqual({
      model: null,
      cue: DEFAULT_WAKE_WORD_CUE,
    });
  });

  it("accepts each wake word model of the union", () => {
    for (const model of WAKE_WORD_MODEL_IDS) {
      const result = validateDeviceConfig({ ...DEFAULT_DEVICE_CONFIG, wakeWord: { model } });
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.config.wakeWord).toEqual({ model, cue: DEFAULT_WAKE_WORD_CUE });
      }
    }
  });

  it("accepts a null wake word and migrates an absent block to the default", () => {
    const nulled = { ...DEFAULT_DEVICE_CONFIG, wakeWord: { model: null } };
    const nulledResult = validateDeviceConfig(nulled);
    expect(nulledResult.ok).toBe(true);
    if (nulledResult.ok) {
      expect(nulledResult.config.wakeWord.cue).toEqual(DEFAULT_WAKE_WORD_CUE);
    }
    // Config stockee anterieure au 18/09/2026 : le bloc est absent.
    const legacy: Record<string, unknown> = { ...DEFAULT_DEVICE_CONFIG };
    delete legacy.wakeWord;
    const result = validateDeviceConfig(legacy);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.config.wakeWord).toEqual({
        model: null,
        cue: DEFAULT_WAKE_WORD_CUE,
      });
    }
  });

  it("migrates a wake word block without cue to the default cue", () => {
    // Config stockee anterieure au 18/09/2026 : `model` present, pas de `cue`.
    const legacy = { ...DEFAULT_DEVICE_CONFIG, wakeWord: { model: "alexa" } };
    const result = validateDeviceConfig(legacy);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.config.wakeWord).toEqual({
        model: "alexa",
        cue: DEFAULT_WAKE_WORD_CUE,
      });
    }
  });

  it("accepts an explicit valid cue", () => {
    const custom = {
      flashColor: "#ff8800",
      blinkDurationMs: 1500,
      animationUrl: "/animations/Surprised.vrma",
    };
    const result = validateDeviceConfig({
      ...DEFAULT_DEVICE_CONFIG,
      wakeWord: { model: "hey_jarvis", cue: custom },
    });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.config.wakeWord.cue).toEqual(custom);
  });

  it("rejects an invalid wake word cue.flashColor", () => {
    const bad = {
      ...DEFAULT_DEVICE_CONFIG,
      wakeWord: {
        model: "hey_jarvis",
        cue: { ...DEFAULT_WAKE_WORD_CUE, flashColor: "#22D3EE" },
      },
    };
    const result = validateDeviceConfig(bad);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.join(" ")).toContain("wakeWord.cue.flashColor");
  });

  it("rejects a wake word cue.blinkDurationMs out of bounds or non-integer", () => {
    for (const blinkDurationMs of [299, 3001, 900.5, Number.NaN]) {
      const bad = {
        ...DEFAULT_DEVICE_CONFIG,
        wakeWord: {
          model: "hey_jarvis",
          cue: { ...DEFAULT_WAKE_WORD_CUE, blinkDurationMs },
        },
      };
      const result = validateDeviceConfig(bad);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.errors.join(" ")).toContain("wakeWord.cue.blinkDurationMs");
      }
    }
  });

  it("rejects a wake word cue.animationUrl outside the catalog", () => {
    const bad = {
      ...DEFAULT_DEVICE_CONFIG,
      wakeWord: {
        model: "hey_jarvis",
        cue: {
          ...DEFAULT_WAKE_WORD_CUE,
          animationUrl: "/animations/does-not-exist.vrma",
        },
      },
    };
    const result = validateDeviceConfig(bad);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.join(" ")).toContain("wakeWord.cue.animationUrl");
  });

  it("exports the wake word cue defaults aligned with the web reference", () => {
    expect(WAKE_WORD_CUE_FLASH_COLOR).toBe("#22d3ee");
    expect(WAKE_WORD_CUE_DEFAULT_DURATION_MS).toBe(900);
    expect(WAKE_WORD_CUE_DEFAULT_ANIMATION_URL).toBe("/animations/Greeting.vrma");
    expect(DEFAULT_WAKE_WORD_CUE).toEqual({
      flashColor: "#22d3ee",
      blinkDurationMs: 900,
      animationUrl: "/animations/Greeting.vrma",
    });
  });

  it("rejects an unknown wake word model (present block is validated)", () => {
    const bad = { ...DEFAULT_DEVICE_CONFIG, wakeWord: { model: "hey_siri" } };
    const result = validateDeviceConfig(bad);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.join(" ")).toContain("wakeWord.model");
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
        stt: { ...DEFAULT_DEVICE_CONFIG.providers.stt, provider: "deepgram", model: "" },
      },
    };
    expect(validateDeviceConfig(emptyModel).ok).toBe(false);
  });

  it("accepts the unconfigured sentinel \"none\" without requiring model/endpoint", () => {
    const none = {
      ...DEFAULT_DEVICE_CONFIG,
      providers: {
        ...DEFAULT_DEVICE_CONFIG.providers,
        llm: { provider: "none", model: "ignored", endpoint: "https://ignored", voiceId: "ignored" },
      },
    };
    const result = validateDeviceConfig(none);
    expect(result.ok).toBe(true);
    if (result.ok) {
      // La sentinelle normalise model/endpoint/voiceId (etat canonique).
      expect(result.config.providers.llm).toEqual({
        provider: "none",
        model: "",
        endpoint: null,
        voiceId: null,
      });
    }
  });

  it("starts every slot unconfigured (rien de pré-activé)", () => {
    expect(DEFAULT_DEVICE_CONFIG.providers.llm.provider).toBe("none");
    expect(DEFAULT_DEVICE_CONFIG.providers.tts.provider).toBe("none");
    expect(DEFAULT_DEVICE_CONFIG.providers.stt.provider).toBe("none");
  });

  it("le slot TTS par defaut porte speed:null, les autres slots non", () => {
    expect(DEFAULT_DEVICE_CONFIG.providers.tts.speed).toBeNull();
    expect(DEFAULT_DEVICE_CONFIG.providers.llm).not.toHaveProperty("speed");
    expect(DEFAULT_DEVICE_CONFIG.providers.stt).not.toHaveProperty("speed");
  });

  it("accepte et normalise providers.tts.speed (null / absent -> null)", () => {
    const base = {
      ...DEFAULT_DEVICE_CONFIG,
      providers: {
        ...DEFAULT_DEVICE_CONFIG.providers,
        tts: { provider: "openai" as const, model: "gpt-4o-mini-tts", endpoint: null, voiceId: "coral" },
      },
    };
    // Absent (config stockee anterieure) -> null : migration, pas d'erreur.
    const absent = validateDeviceConfig(base);
    expect(absent.ok).toBe(true);
    if (absent.ok) expect(absent.config.providers.tts.speed).toBeNull();

    // null explicite -> null.
    const explicit = validateDeviceConfig({
      ...base,
      providers: { ...base.providers, tts: { ...base.providers.tts, speed: null } },
    });
    expect(explicit.ok).toBe(true);
    if (explicit.ok) expect(explicit.config.providers.tts.speed).toBeNull();
  });

  it("conserve une vitesse TTS valide dans les bornes", () => {
    const result = validateDeviceConfig({
      ...DEFAULT_DEVICE_CONFIG,
      providers: {
        ...DEFAULT_DEVICE_CONFIG.providers,
        tts: { provider: "openai", model: "gpt-4o-mini-tts", endpoint: null, voiceId: "coral", speed: 1.5 },
      },
    });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.config.providers.tts.speed).toBe(1.5);
  });

  it("clampe une vitesse TTS finie hors bornes (miroir du clamp appliance)", () => {
    for (const [input, expected] of [
      [0.1, 0.25],
      [10, 4],
      [0.25, 0.25],
      [4, 4],
    ] as const) {
      const result = validateDeviceConfig({
        ...DEFAULT_DEVICE_CONFIG,
        providers: {
          ...DEFAULT_DEVICE_CONFIG.providers,
          tts: { provider: "openai", model: "m", endpoint: null, voiceId: null, speed: input },
        },
      });
      expect(result.ok).toBe(true);
      if (result.ok) expect(result.config.providers.tts.speed).toBe(expected);
    }
  });

  it("rejette une vitesse TTS non numerique ou non finie (jamais de NaN sur le fil)", () => {
    for (const speed of ["fast", Number.NaN, Number.POSITIVE_INFINITY]) {
      const result = validateDeviceConfig({
        ...DEFAULT_DEVICE_CONFIG,
        providers: {
          ...DEFAULT_DEVICE_CONFIG.providers,
          tts: { provider: "openai", model: "m", endpoint: null, voiceId: null, speed },
        },
      });
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.errors.join(" ")).toContain("providers.tts.speed");
      }
    }
  });

  it("ignore speed sur les providers sans plage (llm non-realtime, stt)", () => {
    const result = validateDeviceConfig({
      ...DEFAULT_DEVICE_CONFIG,
      providers: {
        ...DEFAULT_DEVICE_CONFIG.providers,
        llm: { provider: "openai", model: "m", endpoint: null, voiceId: null, speed: 2 },
        stt: { provider: "deepgram", model: "m", endpoint: null, voiceId: null, speed: 2 },
      },
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.config.providers.llm).not.toHaveProperty("speed");
      expect(result.config.providers.stt).not.toHaveProperty("speed");
    }
  });

  it("accepte et clampe llm.speed pour un LLM realtime a plage (openai-realtime)", () => {
    const withSpeed = (speed?: number | null) =>
      validateDeviceConfig({
        ...DEFAULT_DEVICE_CONFIG,
        providers: {
          ...DEFAULT_DEVICE_CONFIG.providers,
          llm: {
            provider: "openai-realtime",
            model: "gpt-realtime-2",
            endpoint: null,
            voiceId: "coral",
            ...(speed === undefined ? {} : { speed }),
          },
        },
      });

    // Absent (config stockee anterieure) et null explicite -> null (defaut).
    for (const result of [withSpeed(), withSpeed(null)]) {
      expect(result.ok).toBe(true);
      if (result.ok) expect(result.config.providers.llm.speed).toBeNull();
    }
    // Nombre fini conserve, hors bornes clampe dans [0.25, 1.5].
    const valid = withSpeed(1.0);
    expect(valid.ok).toBe(true);
    if (valid.ok) expect(valid.config.providers.llm.speed).toBe(1.0);
    for (const [input, expected] of [
      [0.1, 0.25],
      [9, 1.5],
    ] as const) {
      const clamped = withSpeed(input);
      expect(clamped.ok).toBe(true);
      if (clamped.ok) expect(clamped.config.providers.llm.speed).toBe(expected);
    }
  });

  it("rejette un llm.speed non numerique ou non fini (jamais de NaN sur le fil)", () => {
    for (const speed of ["fast", Number.NaN, Number.POSITIVE_INFINITY]) {
      const result = validateDeviceConfig({
        ...DEFAULT_DEVICE_CONFIG,
        providers: {
          ...DEFAULT_DEVICE_CONFIG.providers,
          llm: { provider: "openai-realtime", model: "m", endpoint: null, voiceId: null, speed },
        },
      });
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.errors.join(" ")).toContain("providers.llm.speed");
    }
  });

  it("ignore llm.speed pour google-live (Gemini Live n'expose pas de vitesse)", () => {
    const result = validateDeviceConfig({
      ...DEFAULT_DEVICE_CONFIG,
      providers: {
        ...DEFAULT_DEVICE_CONFIG.providers,
        llm: { provider: "google-live", model: "m", endpoint: null, voiceId: "Kore", speed: 1.5 },
      },
    });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.config.providers.llm).not.toHaveProperty("speed");
  });

  it("clampe tts.speed dans la plage elevenlabs [0.7, 1.2]", () => {
    const withSpeed = (speed: number) =>
      validateDeviceConfig({
        ...DEFAULT_DEVICE_CONFIG,
        providers: {
          ...DEFAULT_DEVICE_CONFIG.providers,
          tts: {
            provider: "elevenlabs",
            model: "eleven_flash_v2_5",
            endpoint: null,
            voiceId: null,
            speed,
          },
        },
      });
    const valid = withSpeed(0.9);
    expect(valid.ok).toBe(true);
    if (valid.ok) expect(valid.config.providers.tts.speed).toBe(0.9);
    for (const [input, expected] of [
      [0.5, 0.7],
      [2, 1.2],
    ] as const) {
      const clamped = withSpeed(input);
      expect(clamped.ok).toBe(true);
      if (clamped.ok) expect(clamped.config.providers.tts.speed).toBe(expected);
    }
  });

  it("n'emet pas speed pour un TTS sans plage (provider non supporte)", () => {
    const result = validateDeviceConfig({
      ...DEFAULT_DEVICE_CONFIG,
      providers: {
        ...DEFAULT_DEVICE_CONFIG.providers,
        tts: { provider: "deepgram", model: "aura-asteria-en", endpoint: null, voiceId: null, speed: 2 },
      },
    });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.config.providers.tts).not.toHaveProperty("speed");
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

describe("hasUnconfiguredProvider (gate d'envoi)", () => {
  it("bloque tant qu'un des trois slots est \"none\" en mode classique", () => {
    const oneNone: DeviceConfig = {
      ...DEFAULT_DEVICE_CONFIG,
      providers: {
        ...DEFAULT_DEVICE_CONFIG.providers,
        llm: { provider: "openai", model: "gpt-5.5", endpoint: null, voiceId: null },
        tts: { provider: "elevenlabs", model: "m", endpoint: null, voiceId: null },
        // stt reste "none"
      },
    };
    expect(hasUnconfiguredProvider(oneNone)).toBe(true);
  });

  it("ne bloque plus sur tts/stt quand le LLM est realtime (voix entree+sortie)", () => {
    expect(hasUnconfiguredProvider(realtimeWithEmptySpeech("openai-realtime"))).toBe(false);
    expect(hasUnconfiguredProvider(realtimeWithEmptySpeech("google-live"))).toBe(false);
  });

  it("bloque toujours quand le slot LLM lui-meme est \"none\"", () => {
    expect(hasUnconfiguredProvider(DEFAULT_DEVICE_CONFIG)).toBe(true);
  });
});

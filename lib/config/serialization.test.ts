import { describe, expect, it } from "vitest";
import { DEFAULT_DEVICE_CONFIG } from "./defaults";
import {
  applyRealtimeVoiceDefaults,
  parseDeviceConfig,
  REALTIME_STT_FALLBACK,
  REALTIME_TTS_FALLBACK,
  serializeDeviceConfig,
} from "./serialization";
import type { DeviceConfig } from "../../types/config";

/** LLM realtime, TTS/STT restes non configures (etat d'edition mobile). */
const REALTIME_EDIT: DeviceConfig = {
  ...DEFAULT_DEVICE_CONFIG,
  providers: {
    llm: { provider: "openai-realtime", model: "gpt-realtime-2", endpoint: null, voiceId: "coral" },
    tts: { provider: "none", model: "", endpoint: null, voiceId: null },
    stt: { provider: "none", model: "", endpoint: null, voiceId: null },
  },
};

/**
 * Config completement configuree (aucun slot "none") : seule forme envoyable
 * sur le fil. `DEFAULT_DEVICE_CONFIG` contient desormais la sentinelle "none"
 * (rien de pre-active), donc non serialisable telle quelle.
 */
const CONFIGURED: DeviceConfig = {
  ...DEFAULT_DEVICE_CONFIG,
  providers: {
    llm: { provider: "openai", model: "gpt-5.5", endpoint: null, voiceId: null },
    tts: { provider: "elevenlabs", model: "eleven_flash_v2_5", endpoint: null, voiceId: "CwhRBWXzGAHq8TQ4Fs17" },
    stt: { provider: "deepgram", model: "nova-3", endpoint: null, voiceId: null },
  },
};

describe("serializeDeviceConfig / parseDeviceConfig", () => {
  it("round-trips a fully configured configuration", () => {
    const parsed = parseDeviceConfig(serializeDeviceConfig(CONFIGURED));
    expect(parsed).toEqual(CONFIGURED);
  });

  it("transporte le bloc wakeWord sur le fil (choix seul, jamais d'audio)", () => {
    const withWake: DeviceConfig = {
      ...CONFIGURED,
      wakeWord: { ...DEFAULT_DEVICE_CONFIG.wakeWord, model: "hey_jarvis" },
    };
    const parsed = JSON.parse(serializeDeviceConfig(withWake)) as DeviceConfig;
    expect(parsed.wakeWord).toEqual({
      model: "hey_jarvis",
      cue: DEFAULT_DEVICE_CONFIG.wakeWord.cue,
    });
  });

  it("envoie wakeWord.model:null quand aucun wake word n'est choisi", () => {
    const parsed = JSON.parse(serializeDeviceConfig(CONFIGURED)) as DeviceConfig;
    expect(parsed.wakeWord).toEqual(DEFAULT_DEVICE_CONFIG.wakeWord);
  });

  it("transporte la cue (couleur, duree, animation) sur le fil", () => {
    const cue = {
      flashColor: "#ff8800",
      blinkDurationMs: 1500,
      animationUrl: "/animations/Spin.vrma",
    };
    const withCue: DeviceConfig = {
      ...CONFIGURED,
      wakeWord: { model: "hey_jarvis", cue },
    };
    const parsed = JSON.parse(serializeDeviceConfig(withCue)) as DeviceConfig;
    expect(parsed.wakeWord.cue).toEqual(cue);
  });

  it("returns null for corrupted JSON without throwing", () => {
    expect(parseDeviceConfig("{not json")).toBeNull();
    expect(parseDeviceConfig("")).toBeNull();
  });

  it("refuses an incompatible configVersion instead of guessing", () => {
    const old = { ...CONFIGURED, configVersion: "0.9" };
    expect(parseDeviceConfig(JSON.stringify(old))).toBeNull();
    const missing = { ...CONFIGURED } as Record<string, unknown>;
    delete missing.configVersion;
    expect(parseDeviceConfig(JSON.stringify(missing))).toBeNull();
  });

  it("drops unknown fields on parse (stored payloads shrink to the contract)", () => {
    const extra = { ...CONFIGURED, futureField: { a: 1 } };
    const parsed = parseDeviceConfig(JSON.stringify(extra));
    expect(parsed).toEqual(CONFIGURED);
    expect(parseDeviceConfig(serializeDeviceConfig(parsed as never))).not.toContain("futureField");
  });

  it("refuses to serialize a config with an unconfigured provider (\"none\")", () => {
    expect(() => serializeDeviceConfig(DEFAULT_DEVICE_CONFIG)).toThrow(/unconfigured/);
    const oneSlotNone = {
      ...CONFIGURED,
      providers: { ...CONFIGURED.providers, tts: { provider: "none" as const, model: "", endpoint: null, voiceId: null } },
    };
    expect(() => serializeDeviceConfig(oneSlotNone)).toThrow(/unconfigured/);
  });

  it("parses (but does not send) a stored config containing \"none\"", () => {
    // La persistance locale peut contenir "none" : parseDeviceConfig doit
    // l'accepter (etat d'edition valide), seule la serialisation wire refuse.
    const parsed = parseDeviceConfig(JSON.stringify(DEFAULT_DEVICE_CONFIG));
    expect(parsed).toEqual(DEFAULT_DEVICE_CONFIG);
  });
});

describe("applyRealtimeVoiceDefaults (remplissage du fil)", () => {
  it("remplit tts/stt \"none\" par kokoro/distil-whisper quand le LLM est realtime", () => {
    const wire = applyRealtimeVoiceDefaults(REALTIME_EDIT);
    expect(wire.providers.tts).toEqual(REALTIME_TTS_FALLBACK);
    expect(wire.providers.stt).toEqual(REALTIME_STT_FALLBACK);
    // La voix realtime du LLM est preservee (contrat 18/09/2026).
    expect(wire.providers.llm).toEqual(REALTIME_EDIT.providers.llm);
  });

  it("conserve un slot TTS/STT deja configure (valeur valide)", () => {
    const kept: DeviceConfig = {
      ...REALTIME_EDIT,
      providers: {
        ...REALTIME_EDIT.providers,
        tts: { provider: "elevenlabs", model: "eleven_flash_v2_5", endpoint: null, voiceId: "v" },
      },
    };
    const wire = applyRealtimeVoiceDefaults(kept);
    expect(wire.providers.tts).toEqual(kept.providers.tts);
    expect(wire.providers.stt).toEqual(REALTIME_STT_FALLBACK);
  });

  it("ne touche pas une config non realtime", () => {
    expect(applyRealtimeVoiceDefaults(CONFIGURED)).toEqual(CONFIGURED);
  });

  it("serialise une config realtime a slots tts/stt \"none\" (contrat 3 slots)", () => {
    const raw = serializeDeviceConfig(REALTIME_EDIT);
    expect(raw).not.toContain('"none"');
    const parsed = JSON.parse(raw) as DeviceConfig;
    expect(parsed.providers.tts.provider).toBe("kokoro");
    expect(parsed.providers.stt.provider).toBe("distil-whisper");
    expect(parsed.providers.llm.voiceId).toBe("coral");
    // `isProviders` Electron exige un endpoint string : jamais null sur le fil.
    expect(typeof parsed.providers.tts.endpoint).toBe("string");
    expect(typeof parsed.providers.stt.endpoint).toBe("string");
  });

  it("refuse toujours un LLM realtime sans provider LLM choisi", () => {
    const noLlm: DeviceConfig = {
      ...REALTIME_EDIT,
      providers: { ...REALTIME_EDIT.providers, llm: { provider: "none", model: "", endpoint: null, voiceId: null } },
    };
    expect(() => serializeDeviceConfig(noLlm)).toThrow(/unconfigured/);
  });
});

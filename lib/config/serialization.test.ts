import { describe, expect, it } from "vitest";
import { DEFAULT_DEVICE_CONFIG } from "./defaults";
import { parseDeviceConfig, serializeDeviceConfig } from "./serialization";
import type { DeviceConfig } from "../../types/config";

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

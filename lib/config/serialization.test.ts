import { describe, expect, it } from "vitest";
import { DEFAULT_DEVICE_CONFIG } from "./defaults";
import { parseDeviceConfig, serializeDeviceConfig } from "./serialization";

describe("serializeDeviceConfig / parseDeviceConfig", () => {
  it("round-trips a valid configuration", () => {
    const parsed = parseDeviceConfig(serializeDeviceConfig(DEFAULT_DEVICE_CONFIG));
    expect(parsed).toEqual(DEFAULT_DEVICE_CONFIG);
  });

  it("returns null for corrupted JSON without throwing", () => {
    expect(parseDeviceConfig("{not json")).toBeNull();
    expect(parseDeviceConfig("")).toBeNull();
  });

  it("refuses an incompatible configVersion instead of guessing", () => {
    const old = { ...DEFAULT_DEVICE_CONFIG, configVersion: "0.9" };
    expect(parseDeviceConfig(JSON.stringify(old))).toBeNull();
    const missing = { ...DEFAULT_DEVICE_CONFIG } as Record<string, unknown>;
    delete missing.configVersion;
    expect(parseDeviceConfig(JSON.stringify(missing))).toBeNull();
  });

  it("drops unknown fields on parse (stored payloads shrink to the contract)", () => {
    const extra = { ...DEFAULT_DEVICE_CONFIG, futureField: { a: 1 } };
    const parsed = parseDeviceConfig(JSON.stringify(extra));
    expect(parsed).toEqual(DEFAULT_DEVICE_CONFIG);
    expect(parseDeviceConfig(serializeDeviceConfig(parsed as never))).not.toContain("futureField");
  });
});

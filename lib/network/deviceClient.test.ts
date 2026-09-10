import { describe, expect, it } from "vitest";
import {
  validateHostPort,
  buildDesktopUrl,
  parseDesktopHealth,
  parseProvisioningHealth,
} from "./deviceClient";
import { DeviceNetworkError, redactText } from "./networkErrors";

/**
 * Tests du premier slice reseau Phase 6 :
 * - validation des coordonnees D3 (IP manuelle, port) ;
 * - parsing strict du health check Desktop (payload jamais confiance).
 */

describe("validateHostPort", () => {
  it("accepte une IPv4 LAN et un port valide", () => {
    expect(validateHostPort("192.168.1.42", 5173)).toEqual({ ok: true });
  });

  it("refuse un host hors contrat", () => {
    const result = validateHostPort("desktop.local", 5173);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors[0]).toMatch(/IPv4/);
    }
  });

  it("refuse un port hors bornes", () => {
    expect(validateHostPort("192.168.1.42", 0).ok).toBe(false);
    expect(validateHostPort("192.168.1.42", 70000).ok).toBe(false);
  });
});

describe("buildDesktopUrl", () => {
  it("construit l'URL http du Desktop", () => {
    expect(buildDesktopUrl("192.168.1.42", 5173)).toBe(
      "http://192.168.1.42:5173"
    );
  });

  it("refuse des coordonnees invalides", () => {
    expect(() => buildDesktopUrl("desktop.local", 5173)).toThrow(
      DeviceNetworkError
    );
  });
});

describe("parseDesktopHealth", () => {
  it("parse une reponse conforme en ignorant les champs inconnus", () => {
    const result = parseDesktopHealth({
      ok: true,
      name: "Liteforms Desktop",
      protocolVersion: "1.0",
      configVersions: ["1.0"],
      networkMode: "wifi",
      unknownField: "ignored",
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.health.name).toBe("Liteforms Desktop");
      expect(result.health.configVersions).toEqual(["1.0"]);
    }
  });

  it("parse le health du hotspot de provisioning", () => {
    const result = parseProvisioningHealth({
      ok: true,
      mode: "provisioning",
      deviceId: "desktop-8f31",
      name: "Liteforms Desktop",
      protocolVersion: "1.0",
      port: 8080,
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.health.port).toBe(8080);
    }
  });

  it("refuse un provisioning health sans port", () => {
    expect(
      parseProvisioningHealth({
        ok: true,
        mode: "provisioning",
        deviceId: "desktop-8f31",
        name: "Liteforms Desktop",
        protocolVersion: "1.0",
      }).ok
    ).toBe(false);
  });

  it("refuse un health normal utilise comme provisioning", () => {
    expect(
      parseProvisioningHealth({
        ok: true,
        mode: "wifi",
        deviceId: "desktop-8f31",
        name: "Liteforms Desktop",
        protocolVersion: "1.0",
      }).ok
    ).toBe(false);
  });

  it("refuse ok false", () => {
    expect(parseDesktopHealth({ ok: false }).ok).toBe(false);
  });

  it("refuse un payload non objet", () => {
    expect(parseDesktopHealth(null).ok).toBe(false);
    expect(parseDesktopHealth("hello").ok).toBe(false);
  });

  it("refuse name ou protocolVersion non textuels", () => {
    expect(parseDesktopHealth({ ok: true, name: 42, protocolVersion: "1.0" }).ok).toBe(false);
  });
});

describe("redactText", () => {
  it("masque les tokens Bearer", () => {
    expect(redactText("GET /api/device-config Authorization: Bearer abc123")).toBe(
      "GET /api/device-config Authorization: Bearer [redacted]"
    );
  });

  it("masque les cles provider et codes de pairing", () => {
    expect(redactText("key=sk-abcdef123456")).toContain("sk-[redacted]");
    expect(redactText("pairing=8f2c1d token ok")).toContain("[redacted]");
  });
});

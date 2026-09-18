import { afterEach, describe, expect, it, vi } from "vitest";
import {
  sendDeviceConfig,
  validateHostPort,
  buildDesktopUrl,
  parseDesktopHealth,
  parseDeviceConfigAck,
  parseProvisioningHealth,
  parseProvisioningStatus,
  fetchProvisioningStatus,
  resetProvisioning,
  fetchVrmList,
  parseVrmList,
  parseCredentialAck,
  postCredential,
  parseProviderStatus,
  getProviderStatus,
} from "./deviceClient";
import { DeviceNetworkError, redactText } from "./networkErrors";
import { DEVICE_CONFIG_VERSION, type DeviceConfig } from "../../types/config";

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

  it("parse le health du hotspot de provisioning", () => {    const result = parseProvisioningHealth({
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

/** Configuration minimale valide, non secrete, pour l'envoi. */
function makeConfig(): DeviceConfig {
  return {
    configVersion: DEVICE_CONFIG_VERSION,
    character: { name: "Clawdia", pronouns: "SHE", personality: "x", greeting: "Salut !" },
    avatar: {
      mood: "happy",
      modelRef: { id: "lobsterEdit", fileName: "lobsterEdit.vrm", hash: null },
      pose: { avatarYaw: 0, alcoveYaw: 0, zoom: 1, depth: 0 },
    },
    environment: { alcoveColor: "#4a90d9" },
    wakeWord: { model: null },
    providers: {
      llm: { provider: "openai", model: "gpt-5.5", endpoint: null, voiceId: null },
      tts: { provider: "elevenlabs", model: "flash", endpoint: null, voiceId: "abc" },
      stt: { provider: "deepgram", model: "nova-3", endpoint: null, voiceId: null },
    },
  };
}

function mockFetchOnce(payload: unknown, status = 200): void {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response(JSON.stringify(payload), { status }))
  );
}

describe("sendDeviceConfig", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("poste le JSON sur /api/device-config et parse l'accuse avec warnings", async () => {
    const fetchMock = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            ok: true,
            configVersion: "1.0",
            appliedAt: "2026-09-12T10:00:00Z",
            warnings: ["mood non appliqué"],
          }),
          { status: 200 }
        )
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = await sendDeviceConfig("192.168.1.42", 43178, makeConfig());

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.appliedAt).toBe("2026-09-12T10:00:00Z");
      expect(result.warnings).toEqual(["mood non appliqué"]);
    }
    const [url, init] = fetchMock.mock.calls[0] as unknown as [
      string,
      RequestInit & { body: string },
    ];
    expect(url).toBe("http://192.168.1.42:43178/api/device-config");
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body).configVersion).toBe("1.0");
  });

  it("retourne le code contractuel sur une erreur 400", async () => {
    mockFetchOnce(
      { ok: false, code: "MODEL_REF_UNKNOWN", message: "VRM inconnu" },
      400
    );

    const result = await sendDeviceConfig("192.168.1.42", 43178, makeConfig());

    expect(result).toEqual({
      ok: false,
      error: "MODEL_REF_UNKNOWN : VRM inconnu",
    });
  });

  it("refuse un accuse ok=true mal forme", () => {
    expect(parseDeviceConfigAck({ ok: true, configVersion: "1.0", warnings: "non" }).ok
    ).toBe(false);
    expect(parseDeviceConfigAck({ ok: false }).ok).toBe(false);
    expect(parseDeviceConfigAck(null).ok).toBe(false);
  });
});

describe("resetProvisioning (15/09/2026)", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("poste un corps vide sur /api/provisioning/reset et parse le 202", async () => {
    const fetchMock = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            ok: true,
            restartRequired: true,
            message: "Provisioning reset accepted",
          }),
          { status: 202 }
        )
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = await resetProvisioning("192.168.1.42", 43178);

    expect(result).toEqual({ ok: true, restartRequired: true });
    const [url, init] = fetchMock.mock.calls[0] as unknown as [
      string,
      RequestInit,
    ];
    expect(url).toBe("http://192.168.1.42:43178/api/provisioning/reset");
    expect(init.method).toBe("POST");
    expect(init.body).toBeUndefined();
  });

  it("echec reseau apres envoi = reachable:false, non fatal", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new TypeError("Network request failed");
      })
    );
    const result = await resetProvisioning("192.168.1.42", 43178);
    expect(result).toEqual({ reachable: false });
  });

  it("timeout (appliance en relance) = reachable:false", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        const error = new Error("Aborted");
        error.name = "AbortError";
        throw error;
      })
    );
    const result = await resetProvisioning("192.168.1.42", 43178);
    expect(result).toEqual({ reachable: false });
  });

  it("HTTP 4xx/5xx = erreur reelle affichable", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({ ok: false }), { status: 404 }))
    );
    const result = await resetProvisioning("192.168.1.42", 43178);
    expect(result).toEqual({
      ok: false,
      error: "HTTP 404 pendant la demande de reset.",
    });
  });

  it("payload sans ok:true = erreur reelle", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify(null), { status: 200 }))
    );
    const result = await resetProvisioning("192.168.1.42", 43178);
    expect(result).toEqual({ ok: false, error: "Réponse de reset invalide." });
  });

  it("coordonnees invalides = erreur sans appel fetch", async () => {
    const result = await resetProvisioning("desktop.local", 43178);
    expect("ok" in result && result.ok).toBe(false);
  });
});

describe("parseVrmList", () => {
  it("parse la liste POC en ignorant les champs inconnus", () => {
    const result = parseVrmList({
      ok: true,
      vrms: [
        {
          id: "lobsterEdit",
          fileName: "lobsterEdit.vrm",
          sizeBytes: 5200000,
          builtin: true,
          unknownField: "ignore",
        },
      ],
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.vrms).toEqual([
        { id: "lobsterEdit", fileName: "lobsterEdit.vrm", sizeBytes: 5200000, builtin: true },
      ]);
    }
  });

  it("refuse ok=false, tableau manquant ou payload non objet", () => {
    expect(parseVrmList({ ok: false, vrms: [] }).ok).toBe(false);
    expect(parseVrmList({ ok: true }).ok).toBe(false);
    expect(parseVrmList(null).ok).toBe(false);
  });

  it("refuse une entree incomplete", () => {
    expect(
      parseVrmList({ ok: true, vrms: [{ id: "", fileName: "a.vrm", sizeBytes: 1 }] }).ok
    ).toBe(false);
    expect(
      parseVrmList({ ok: true, vrms: [{ id: "a", fileName: "a.vrm", sizeBytes: "grand" }] }).ok
    ).toBe(false);
  });
});

describe("fetchVrmList", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("recupere et parse la liste sur /api/device/vrms", async () => {
    const fetchMock = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            ok: true,
            vrms: [
              {
                id: "lobsterEdit",
                fileName: "lobsterEdit.vrm",
                sizeBytes: 5200000,
                builtin: true,
              },
            ],
          }),
          { status: 200 }
        )
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = await fetchVrmList("192.168.1.42", 43178);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.vrms).toEqual([
        { id: "lobsterEdit", fileName: "lobsterEdit.vrm", sizeBytes: 5200000, builtin: true },
      ]);
    }
    expect((fetchMock.mock.calls[0] as unknown as [string])[0]).toBe(
      "http://192.168.1.42:43178/api/device/vrms"
    );
  });

  it("retourne une erreur sur une reponse non JSON", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        // Corps JSON valide mais non conforme (null) : echec de parsing.
        ({ ok: true, status: 200, json: async () => null }) as unknown as Response
      )
    );
    const result = await fetchVrmList("192.168.1.42", 43178);
    expect(result).toEqual({
      ok: false,
      error: "Réponse Desktop non JSON ou vide.",
    });
  });

  it("retourne une erreur reseau redactee sur Desktop injoignable", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new TypeError("Network request failed");
      })
    );
    const result = await fetchVrmList("192.168.1.42", 43178);
    expect(result).toEqual({
      ok: false,
      error: "Desktop injoignable : vérifie l'IP, le port et le même Wi-Fi.",
    });
  });

  it("retourne une erreur sur des coordonnees invalides", async () => {
    expect((await fetchVrmList("desktop.local", 43178)).ok).toBe(false);
  });
});

describe("parseDesktopHealth + deviceId (13/09/2026)", () => {
  it("expose le deviceId additif quand le serveur l'envoie", () => {
    const result = parseDesktopHealth({
      ok: true,
      name: "Liteforms Desktop",
      protocolVersion: "1.0",
      deviceId: "desktop-8f31",
    });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.health.deviceId).toBe("desktop-8f31");
  });

  it("reste valide sans deviceId (serveur v1 anterieur)", () => {
    const result = parseDesktopHealth({
      ok: true,
      name: "Liteforms Desktop",
      protocolVersion: "1.0",
    });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.health.deviceId).toBeUndefined();
  });

  it("deviceId non-textuel est ignore, pas fatal", () => {
    const result = parseDesktopHealth({
      ok: true,
      name: "Liteforms Desktop",
      protocolVersion: "1.0",
      deviceId: 42,
    });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.health.deviceId).toBeUndefined();
  });
});

describe("parseProvisioningStatus (13/09/2026)", () => {
  it("parse joining/joined/failed", () => {
    expect(parseProvisioningStatus({ ok: true, phase: "joining" }).ok).toBe(true);
    const joined = parseProvisioningStatus({
      ok: true,
      phase: "joined",
      deviceId: "desktop-8f31",
    });
    expect(joined.ok).toBe(true);
    if (joined.ok) {
      expect(joined.status.phase).toBe("joined");
      expect(joined.status.deviceId).toBe("desktop-8f31");
    }
    expect(parseProvisioningStatus({ ok: true, phase: "failed" }).ok).toBe(true);
  });

  it("refuse ok=false ou phase hors union", () => {
    expect(parseProvisioningStatus({ ok: false, phase: "joined" }).ok).toBe(false);
    expect(parseProvisioningStatus({ ok: true, phase: "mystery" }).ok).toBe(false);
    expect(parseProvisioningStatus(null).ok).toBe(false);
  });
});

describe("fetchProvisioningStatus", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("retourne le statut conforme", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(
          JSON.stringify({ ok: true, phase: "joined", deviceId: "desktop-8f31" }),
          { status: 200 }
        )
      )
    );
    const result = await fetchProvisioningStatus("192.168.4.1", 8080);
    expect(result).toEqual({
      reachable: true,
      status: { ok: true, phase: "joined", deviceId: "desktop-8f31" },
    });
  });

  it("hotspot mort = reachable:false, jamais une erreur affichee", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new TypeError("Network request failed");
      })
    );
    const result = await fetchProvisioningStatus("192.168.4.1", 8080);
    expect(result).toEqual({ reachable: false });
  });

  it("timeout = reachable:false (abort, meme status)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        const error = new Error("Aborted");
        error.name = "AbortError";
        throw error;
      })
    );
    const result = await fetchProvisioningStatus("192.168.4.1", 8080);
    expect(result).toEqual({ reachable: false });
  });

  it("payload invalide = reachable avec invalid:true", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(JSON.stringify({ ok: true, phase: 42 }), { status: 200 })
      )
    );
    const result = await fetchProvisioningStatus("192.168.4.1", 8080);
    expect(result.reachable).toBe(true);
    if (result.reachable && "invalid" in result) {
      expect(result.invalid).toBe(true);
    }
  });
});

describe("parseCredentialAck (17/09/2026)", () => {
  it("parse un accuse conforme (jamais d'echo de cle)", () => {
    const result = parseCredentialAck({
      ok: true,
      provider: "openai",
      configured: true,
      maskedKey: "sk-****",
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.ack).toEqual({
        ok: true,
        provider: "openai",
        configured: true,
        maskedKey: "sk-****",
      });
    }
  });

  it("accepte maskedKey null (non configure)", () => {
    const result = parseCredentialAck({
      ok: true,
      provider: "openai",
      configured: false,
      maskedKey: null,
    });
    expect(result.ok).toBe(true);
  });

  it("refuse ok=false, configured non booleen ou payload non objet", () => {
    expect(parseCredentialAck({ ok: false }).ok).toBe(false);
    expect(parseCredentialAck(null).ok).toBe(false);
    expect(
      parseCredentialAck({ ok: true, provider: "openai", configured: "yes", maskedKey: null }).ok
    ).toBe(false);
  });
});

describe("postCredential (17/09/2026)", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("poste provider + apiKey sur /api/credentials et parse l'accuse", async () => {
    const fetchMock = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            ok: true,
            provider: "openai",
            configured: true,
            maskedKey: "sk-****",
          }),
          { status: 200 }
        )
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = await postCredential("192.168.1.42", 43178, {
      provider: "openai",
      apiKey: "sk-secret",
    });

    expect(result).toEqual({
      ok: true,
      provider: "openai",
      configured: true,
      maskedKey: "sk-****",
    });
    const [url, init] = fetchMock.mock.calls[0] as unknown as [
      string,
      RequestInit & { body: string },
    ];
    expect(url).toBe("http://192.168.1.42:43178/api/credentials");
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body)).toEqual({ provider: "openai", apiKey: "sk-secret" });
  });

  it("retourne le code UNKNOWN_PROVIDER sur un 400 contractuel", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(JSON.stringify({ ok: false, code: "UNKNOWN_PROVIDER" }), { status: 400 })
      )
    );
    const result = await postCredential("192.168.1.42", 43178, {
      provider: "nope",
      apiKey: "sk",
    });
    expect(result).toEqual({ ok: false, error: "UNKNOWN_PROVIDER" });
  });

  it("retourne le code INVALID_FIELD sur un 400 contractuel", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(JSON.stringify({ ok: false, code: "INVALID_FIELD" }), { status: 400 })
      )
    );
    const result = await postCredential("192.168.1.42", 43178, {
      provider: "openai",
      apiKey: "",
    });
    expect(result).toEqual({ ok: false, error: "INVALID_FIELD" });
  });
});

describe("parseProviderStatus (protocole v1)", () => {
  it("parse llm/tts/stt sans cle reelle", () => {
    const result = parseProviderStatus({
      ok: true,
      providers: {
        llm: { provider: "openai", configured: true, maskedKey: "sk-****" },
        tts: { provider: "elevenlabs", configured: false, maskedKey: null },
        stt: { provider: "deepgram", configured: false, maskedKey: null },
      },
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.status.providers.llm.configured).toBe(true);
      expect(result.status.providers.tts.maskedKey).toBeNull();
    }
  });

  it("refuse un slot manquant, ok=false ou payload non objet", () => {
    expect(parseProviderStatus({ ok: true }).ok).toBe(false);
    expect(parseProviderStatus(null).ok).toBe(false);
    expect(
      parseProviderStatus({
        ok: true,
        providers: { llm: null, tts: null, stt: null },
      }).ok
    ).toBe(false);
  });
});

describe("getProviderStatus (protocole v1)", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("recupere et parse le statut sur /api/provider-status", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(
          JSON.stringify({
            ok: true,
            providers: {
              llm: { provider: "openai", configured: true, maskedKey: "sk-****" },
              tts: { provider: "elevenlabs", configured: false, maskedKey: null },
              stt: { provider: "deepgram", configured: false, maskedKey: null },
            },
          }),
          { status: 200 }
        )
      )
    );
    const result = await getProviderStatus("192.168.1.42", 43178);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.providers.llm.maskedKey).toBe("sk-****");
    }
  });

  it("retourne une erreur sur un HTTP non-2xx", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({ ok: false }), { status: 500 }))
    );
    const result = await getProviderStatus("192.168.1.42", 43178);
    expect(result).toEqual({
      ok: false,
      error: "HTTP 500 sur le statut providers.",
    });
  });

  it("retourne une erreur reseau redactee sur Desktop injoignable", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new TypeError("Network request failed");
      })
    );
    const result = await getProviderStatus("192.168.1.42", 43178);
    expect(result).toEqual({
      ok: false,
      error: "Desktop injoignable : vérifie l'IP, le port et le même Wi-Fi.",
    });
  });
});

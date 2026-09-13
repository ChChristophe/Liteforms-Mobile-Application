import { describe, expect, it, vi } from "vitest";
import {
  discoverDesktop,
  inferSubnetBase,
} from "./discovery";

/**
 * Moteur de decouverte « zéro IP » (13/09/2026) : suppression pur fetch —
 * `fetchImpl` injecte, IP locale fixe par le test (jamais expo-network).
 * Regression protegee : le match strict sur `deviceId` et le rejet des
 * appliance en mode provisioning.
 */

const TIMEOUT = { timeoutPerHostMs: 50, concurrency: 30 };

/** Reponse /api/health conforme, parametrable via champs optionnels. */
function healthResponse(opts: {
  deviceId?: string;
  networkMode?: string;
  name?: string;
}): Response {
  return new Response(
    JSON.stringify({
      ok: true,
      name: opts.name ?? "Liteforms Desktop",
      protocolVersion: "1.0",
      configVersions: ["1.0"],
      ...(opts.networkMode !== undefined ? { networkMode: opts.networkMode } : {}),
      ...(opts.deviceId !== undefined ? { deviceId: opts.deviceId } : {}),
    }),
    { status: 200 }
  );
}

/** Reponse /api/provisioning/health conforme. */
function provisioningResponse(deviceId: string): Response {
  return new Response(
    JSON.stringify({
      ok: true,
      mode: "provisioning",
      deviceId,
      name: "Liteforms Desktop",
      protocolVersion: "1.0",
      port: 8080,
    }),
    { status: 200 }
  );
}

/**
 * Fetch factice : seuls les hotes references repondent ; les autres echouent
 * comme un hote inexistant (TypeError).
 */
function makeFakeFetcher(
  responders: Record<string, () => Response>
): { fetchMock: typeof fetch; dns: string[] } {
  const dns: string[] = [];
  const fetchMock = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const host = new URL(url).hostname;
    dns.push(host);
    const responder = responders[host];
    if (responder === undefined) {
      throw new TypeError("Network request failed");
    }
    void init;
    return responder();
  }) as typeof fetch;
  return { fetchMock, dns };
}

describe("inferSubnetBase", () => {
  it("extrait la base d'un /24 depuis l'IP locale", () => {
    expect(inferSubnetBase("192.168.1.42")).toBe("192.168.1.");
    expect(inferSubnetBase("10.0.0.7")).toBe("10.0.0.");
  });

  it("refuse une IP non utilisable", () => {
    expect(inferSubnetBase("desktop.local")).toBe(null);
    expect(inferSubnetBase("999.1.1.1")).toBe(null);
  });
});

describe("discoverDesktop", () => {
  it("retourne une erreur claire sans IP locale", async () => {
    const result = await discoverDesktop(null);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/inconnue/);
  });

  it("retourne une erreur sur un /24 sans appliance", async () => {
    const { fetchMock } = makeFakeFetcher({});
    const result = await discoverDesktop("192.168.50.9", {
      ...TIMEOUT,
      fetchImpl: fetchMock,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain("192.168.50.");
  });

  it("trouve l'appliance par deviceId strict (re-match post-bascule)", async () => {
    const { fetchMock, dns } = makeFakeFetcher({
      "192.168.1.53": () =>
        healthResponse({ deviceId: "desktop-8f31" }),
      "192.168.1.77": () => healthResponse({ deviceId: "desktop-9999" }),
    });
    const result = await discoverDesktop("192.168.1.42", {
      ...TIMEOUT,
      deviceId: "desktop-8f31",
      fetchImpl: fetchMock,
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.host).toBe("192.168.1.53");
      expect(result.deviceId).toBe("desktop-8f31");
      expect(result.name).toBe("Liteforms Desktop");
    }
    // le scan a bien couvert des hotes apres la cible (non court-circuite).
    expect(dns).toContain("192.168.1.77");
  });

  it("n'accepte pas une appliance non identifiee quand un deviceId est attendu", async () => {
    const { fetchMock } = makeFakeFetcher({
      "192.168.1.30": () => healthResponse({ deviceId: "desktop-f001" }),
      "192.168.1.31": () => healthResponse({ name: "Serveur v1 sans deviceId" }),
    });
    const result = await discoverDesktop("192.168.1.20", {
      ...TIMEOUT,
      deviceId: "desktop-8f31",
      fetchImpl: fetchMock,
    });
    expect(result.ok).toBe(false);
  });

  it("premiere association : accepte la premiere appliance saine hors provisioning", async () => {
    const { fetchMock } = makeFakeFetcher({
      "192.168.1.12": () => healthResponse({ networkMode: "wifi" }),
    });
    const result = await discoverDesktop("192.168.1.5", {
      ...TIMEOUT,
      fetchImpl: fetchMock,
    });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.host).toBe("192.168.1.12");
  });

  it("ignore l'appliance en mode provisioning hors hotspot", async () => {
    const { fetchMock } = makeFakeFetcher({
      "192.168.1.12": () =>
        healthResponse({ networkMode: "provisioning" }),
    });
    const result = await discoverDesktop("192.168.1.5", {
      ...TIMEOUT,
      fetchImpl: fetchMock,
    });
    expect(result.ok).toBe(false);
  });

  it("mode hotspot : accepte le provisioning health sur le port 8080", async () => {
    let calledProvisioning = false;
    const fetchMock = (async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith("/api/provisioning/health")) {
        calledProvisioning = true;
        return provisioningResponse("desktop-8f31");
      }
      throw new TypeError("Network request failed");
    }) as typeof fetch;
    const result = await discoverDesktop("192.168.4.30", {
      deviceId: "desktop-8f31",
      acceptProvisioning: true,
      timeoutPerHostMs: 50,
      concurrency: 30,
      fetchImpl: fetchMock,
    });
    expect(calledProvisioning).toBe(true);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.port).toBe(8080);
      expect(result.deviceId).toBe("desktop-8f31");
    }
  });

  it("le scan ne retient pas le raw JSON invalide (pas de confiance)", async () => {
    const { fetchMock } = makeFakeFetcher({
      "192.168.1.15": () =>
        new Response(JSON.stringify({ ok: true, name: 42 }), { status: 200 }),
    });
    const result = await discoverDesktop("192.168.1.9", {
      ...TIMEOUT,
      fetchImpl: fetchMock,
    });
    expect(result.ok).toBe(false);
  });
});

// ponytail: 254 hotes mockes par sonde reelle 300 ms — la couverture fine
// des timeouts vient du terrain (Expo Go), les 300 ms reelles ne sont pas
// simulees ; 50 ms par sonde suffit pour 254 hotes x 30 workers.

import { afterEach, describe, expect, it, vi } from "vitest";
import {
  fetchHueStatus,
  pairHue,
  parseHuePair,
  parseHueStatus,
  parseHueUnpair,
  unpairHue,
} from "./hueClient";

/**
 * Tests du client Hue (protocole 23/09/2026) : parsing sans confiance des
 * trois routes, erreurs contractuelles exploitables, erreurs reseau, et
 * forme exacte des requetes (methode, URL, corps optionnel de `pair`).
 */

afterEach(() => {
  vi.unstubAllGlobals();
});

function mockFetchOnce(payload: unknown, status = 200): ReturnType<typeof vi.fn> {
  const fetchMock = vi.fn(
    async () => new Response(JSON.stringify(payload), { status })
  );
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

describe("parseHueStatus", () => {
  it("parse un statut appairé et ignore les champs inconnus", () => {
    const result = parseHueStatus({
      ok: true,
      paired: true,
      bridgeIp: "192.168.1.150",
      lightCount: 6,
      unknownField: "ignored",
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.status).toEqual({
        ok: true,
        paired: true,
        bridgeIp: "192.168.1.150",
        lightCount: 6,
      });
    }
  });

  it("parse un statut non appairé (bridgeIp et lightCount null)", () => {
    const result = parseHueStatus({
      ok: true,
      paired: false,
      bridgeIp: null,
      lightCount: null,
    });
    expect(result.ok).toBe(true);
  });

  it("refuse ok=false, payload non objet et champs mal typés", () => {
    expect(parseHueStatus({ ok: false }).ok).toBe(false);
    expect(parseHueStatus(null).ok).toBe(false);
    expect(parseHueStatus("hue").ok).toBe(false);
    expect(
      parseHueStatus({ ok: true, paired: "yes", bridgeIp: null, lightCount: null }).ok
    ).toBe(false);
    expect(
      parseHueStatus({ ok: true, paired: false, bridgeIp: 42, lightCount: null }).ok
    ).toBe(false);
    expect(
      parseHueStatus({ ok: true, paired: false, bridgeIp: null, lightCount: -1 }).ok
    ).toBe(false);
    expect(
      parseHueStatus({ ok: true, paired: false, bridgeIp: null, lightCount: 1.5 }).ok
    ).toBe(false);
  });

  it("refuse un bridgeIp absent (contrat string|null)", () => {
    expect(parseHueStatus({ ok: true, paired: false, lightCount: null }).ok).toBe(false);
  });
});

describe("parseHuePair", () => {
  it("parse une réponse d'appairage conforme", () => {
    const result = parseHuePair({ ok: true, paired: true, bridgeIp: "192.168.1.150" });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.pair).toEqual({
        ok: true,
        paired: true,
        bridgeIp: "192.168.1.150",
      });
    }
  });

  it("refuse ok=false, paired non vrai et bridgeIp vide/absent", () => {
    expect(parseHuePair({ ok: false }).ok).toBe(false);
    expect(parseHuePair(null).ok).toBe(false);
    expect(parseHuePair({ ok: true, paired: false, bridgeIp: "1.2.3.4" }).ok).toBe(false);
    expect(parseHuePair({ ok: true, paired: true, bridgeIp: "" }).ok).toBe(false);
    expect(parseHuePair({ ok: true, paired: true }).ok).toBe(false);
  });
});

describe("parseHueUnpair", () => {
  it("parse une purge conforme", () => {
    const result = parseHueUnpair({ ok: true, paired: false });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.unpair).toEqual({ ok: true, paired: false });
  });

  it("refuse ok=false ou paired encore vrai", () => {
    expect(parseHueUnpair({ ok: false, paired: false }).ok).toBe(false);
    expect(parseHueUnpair({ ok: true, paired: true }).ok).toBe(false);
    expect(parseHueUnpair(null).ok).toBe(false);
  });
});

describe("fetchHueStatus", () => {
  it("lit /api/hue/status et parse la réponse", async () => {
    const fetchMock = mockFetchOnce({
      ok: true,
      paired: true,
      bridgeIp: "192.168.1.150",
      lightCount: 3,
    });

    const result = await fetchHueStatus("192.168.1.42", 43178);

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.lightCount).toBe(3);
    expect((fetchMock.mock.calls[0] as unknown as [string])[0]).toBe(
      "http://192.168.1.42:43178/api/hue/status"
    );
  });

  it("retourne une erreur HTTP exploitable", async () => {
    mockFetchOnce({ ok: false }, 500);
    const result = await fetchHueStatus("192.168.1.42", 43178);
    expect(result).toEqual({ ok: false, error: "HTTP 500 sur le statut Hue." });
  });

  it("retourne une erreur reseau redactee sans crash", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new TypeError("Network request failed");
      })
    );
    const result = await fetchHueStatus("192.168.1.42", 43178);
    expect(result).toEqual({
      ok: false,
      error: "Desktop injoignable : vérifie l'IP, le port et le même Wi-Fi.",
    });
  });

  it("refuse des coordonnées invalides sans appel réseau", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const result = await fetchHueStatus("desktop.local", 43178);
    expect(result.ok).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("pairHue", () => {
  it("poste un corps vide sur /api/hue/pair sans bridgeIp", async () => {
    const fetchMock = mockFetchOnce(
      { ok: true, paired: true, bridgeIp: "192.168.1.150" },
      200
    );

    const result = await pairHue("192.168.1.42", 43178);

    expect(result).toEqual({
      ok: true,
      paired: true,
      bridgeIp: "192.168.1.150",
    });
    const [url, init] = fetchMock.mock.calls[0] as unknown as [
      string,
      RequestInit & { body: string },
    ];
    expect(url).toBe("http://192.168.1.42:43178/api/hue/pair");
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body)).toEqual({});
  });

  it("transmet bridgeIp quand fourni", async () => {
    const fetchMock = mockFetchOnce(
      { ok: true, paired: true, bridgeIp: "10.0.0.5" },
      200
    );
    await pairHue("192.168.1.42", 43178, "10.0.0.5");
    const [, init] = fetchMock.mock.calls[0] as unknown as [
      string,
      RequestInit & { body: string },
    ];
    expect(JSON.parse(init.body)).toEqual({ bridgeIp: "10.0.0.5" });
  });

  it("traduit HUE_PAIRING_TIMEOUT en consigne utilisateur", async () => {
    mockFetchOnce({ ok: false, code: "HUE_PAIRING_TIMEOUT" }, 502);
    const result = await pairHue("192.168.1.42", 43178);
    expect(result).toEqual({
      ok: false,
      error:
        "Appairage expiré : appuyez sur le bouton rond du bridge pendant la recherche.",
    });
  });

  it("traduit OPENHUE_MISSING et INVALID_FIELD", async () => {
    mockFetchOnce({ ok: false, code: "OPENHUE_MISSING" }, 502);
    expect((await pairHue("192.168.1.42", 43178)) as { error: string }).toEqual({
      ok: false,
      error:
        "L'appliance n'a pas la commande openhue installée (image à mettre à jour).",
    });
    mockFetchOnce({ ok: false, code: "INVALID_FIELD" }, 400);
    expect((await pairHue("192.168.1.42", 43178, "nope")) as { error: string }).toEqual({
      ok: false,
      error: "Adresse du bridge Hue invalide.",
    });
  });

  it("retombe sur le message serveur pour un code inconnu", async () => {
    mockFetchOnce({ ok: false, code: "WHAT", message: "détail" }, 502);
    const result = await pairHue("192.168.1.42", 43178);
    expect(result).toEqual({ ok: false, error: "détail" });
  });

  it("ne crash pas sur un timeout réseau (AbortError)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        const error = new Error("Aborted");
        error.name = "AbortError";
        throw error;
      })
    );
    const result = await pairHue("192.168.1.42", 43178);
    expect(result).toEqual({ ok: false, error: "Aucune réponse du Desktop en 40 s." });
  });
});

describe("unpairHue", () => {
  it("poste un corps vide sur /api/hue/unpair et parse la purge", async () => {
    const fetchMock = mockFetchOnce({ ok: true, paired: false }, 200);

    const result = await unpairHue("192.168.1.42", 43178);

    expect(result).toEqual({ ok: true, paired: false });
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("http://192.168.1.42:43178/api/hue/unpair");
    expect(init.method).toBe("POST");
    expect(init.body).toBeUndefined();
  });

  it("retourne une erreur sur réponse invalide", async () => {
    mockFetchOnce({ ok: true, paired: true }, 200);
    const result = await unpairHue("192.168.1.42", 43178);
    expect(result).toEqual({
      ok: false,
      error: "Réponse de désappairage Hue invalide.",
    });
  });

  it("retourne une erreur HTTP exploitable", async () => {
    mockFetchOnce({ ok: false }, 500);
    const result = await unpairHue("192.168.1.42", 43178);
    expect(result).toEqual({
      ok: false,
      error: "HTTP 500 pendant le désappairage Hue.",
    });
  });
});

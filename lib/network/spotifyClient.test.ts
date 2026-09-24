import { afterEach, describe, expect, it, vi } from "vitest";
import {
  fetchSpotifyDevices,
  fetchSpotifyStatus,
  parseSpotifyAlias,
  parseSpotifyAuthAck,
  parseSpotifyControl,
  parseSpotifyDevices,
  parseSpotifyStatus,
  sendSpotifyToken,
  setSpotifyAlias,
  setSpotifyDefault,
  spotifyControl,
} from "./spotifyClient";

/**
 * Tests du client Spotify (protocole 24/09/2026) : parsing sans confiance des
 * cinq routes, erreurs contractuelles exploitables, erreurs reseau, et forme
 * exacte des requetes (methode, URL, corps).
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

const DEVICE = {
  id: "dev-1",
  name: "55OLED935/12",
  type: "TV",
  isActive: true,
  alias: "TV Salon",
  isDefault: true,
};

describe("parseSpotifyStatus", () => {
  it("parse un statut conforme et ignore les champs inconnus", () => {
    const result = parseSpotifyStatus({
      ok: true,
      configured: true,
      available: true,
      unknownField: "ignored",
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.status).toEqual({ ok: true, configured: true, available: true });
    }
  });

  it("refuse ok=false, payload non objet et champs mal typés", () => {
    expect(parseSpotifyStatus({ ok: false }).ok).toBe(false);
    expect(parseSpotifyStatus(null).ok).toBe(false);
    expect(parseSpotifyStatus("spotify").ok).toBe(false);
    expect(parseSpotifyStatus({ ok: true, configured: "yes", available: true }).ok).toBe(
      false
    );
    expect(parseSpotifyStatus({ ok: true, configured: true }).ok).toBe(false);
  });
});

describe("parseSpotifyDevices", () => {
  it("parse une liste conforme", () => {
    const result = parseSpotifyDevices({ ok: true, devices: [DEVICE] });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.devices.devices).toEqual([DEVICE]);
  });

  it("parse un alias absent (null)", () => {
    const result = parseSpotifyDevices({
      ok: true,
      devices: [{ ...DEVICE, alias: null, isDefault: false }],
    });
    expect(result.ok).toBe(true);
  });

  it("refuse ok=false, devices non tableau et entrée non conforme", () => {
    expect(parseSpotifyDevices({ ok: false, devices: [] }).ok).toBe(false);
    expect(parseSpotifyDevices({ ok: true, devices: {} }).ok).toBe(false);
    expect(parseSpotifyDevices(null).ok).toBe(false);
    expect(parseSpotifyDevices({ ok: true, devices: [{ ...DEVICE, id: "" }] }).ok).toBe(
      false
    );
    expect(
      parseSpotifyDevices({ ok: true, devices: [{ ...DEVICE, isActive: "yes" }] }).ok
    ).toBe(false);
    expect(
      parseSpotifyDevices({ ok: true, devices: [{ ...DEVICE, alias: 42 }] }).ok
    ).toBe(false);
  });
});

describe("parseSpotifyAuthAck", () => {
  it("parse un accusé conforme", () => {
    const result = parseSpotifyAuthAck({ ok: true, configured: true });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.ack).toEqual({ ok: true, configured: true });
  });

  it("refuse ok=false ou configured non vrai", () => {
    expect(parseSpotifyAuthAck({ ok: false }).ok).toBe(false);
    expect(parseSpotifyAuthAck({ ok: true, configured: false }).ok).toBe(false);
    expect(parseSpotifyAuthAck(null).ok).toBe(false);
  });
});

describe("parseSpotifyAlias", () => {
  it("parse une mise à jour conforme", () => {
    const result = parseSpotifyAlias({ ok: true });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.alias).toEqual({ ok: true });
  });

  it("refuse ok=false ou payload non objet", () => {
    expect(parseSpotifyAlias({ ok: false }).ok).toBe(false);
    expect(parseSpotifyAlias(null).ok).toBe(false);
  });
});

describe("parseSpotifyControl", () => {
  it("parse un contrôle conforme et conserve l'état additionnel", () => {
    const result = parseSpotifyControl({ ok: true, state: "playing" });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.control).toEqual({ ok: true, state: "playing" });
  });

  it("refuse ok=false ou payload non objet", () => {
    expect(parseSpotifyControl({ ok: false }).ok).toBe(false);
    expect(parseSpotifyControl(null).ok).toBe(false);
  });
});

describe("fetchSpotifyStatus", () => {
  it("lit /api/spotify/status et parse la réponse", async () => {
    const fetchMock = mockFetchOnce({
      ok: true,
      configured: true,
      available: true,
    });
    const result = await fetchSpotifyStatus("192.168.1.42", 43178);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.configured).toBe(true);
    expect((fetchMock.mock.calls[0] as unknown as [string])[0]).toBe(
      "http://192.168.1.42:43178/api/spotify/status"
    );
  });

  it("retourne une erreur HTTP exploitable", async () => {
    mockFetchOnce({ ok: false }, 500);
    expect(await fetchSpotifyStatus("192.168.1.42", 43178)).toEqual({
      ok: false,
      error: "HTTP 500 sur le statut Spotify.",
    });
  });

  it("retourne une erreur reseau redactee sans crash", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new TypeError("Network request failed");
      })
    );
    expect(await fetchSpotifyStatus("192.168.1.42", 43178)).toEqual({
      ok: false,
      error: "Desktop injoignable : vérifie l'IP, le port et le même Wi-Fi.",
    });
  });

  it("refuse des coordonnées invalides sans appel réseau", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const result = await fetchSpotifyStatus("desktop.local", 43178);
    expect(result.ok).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("sendSpotifyToken", () => {
  it("poste clientId + refreshToken et parse l'accusé", async () => {
    const fetchMock = mockFetchOnce({ ok: true, configured: true }, 200);
    const result = await sendSpotifyToken("192.168.1.42", 43178, {
      clientId: "client-123",
      refreshToken: "refresh-abc",
    });
    expect(result).toEqual({ ok: true, configured: true });
    const [url, init] = fetchMock.mock.calls[0] as unknown as [
      string,
      RequestInit & { body: string },
    ];
    expect(url).toBe("http://192.168.1.42:43178/api/spotify/auth");
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body)).toEqual({
      clientId: "client-123",
      refreshToken: "refresh-abc",
    });
  });

  it("transmet accessToken/scope/expiresIn quand fournis", async () => {
    const fetchMock = mockFetchOnce({ ok: true, configured: true }, 200);
    await sendSpotifyToken("192.168.1.42", 43178, {
      clientId: "c",
      refreshToken: "r",
      accessToken: "a",
      scope: "user-read-private",
      expiresIn: 3600,
    });
    const [, init] = fetchMock.mock.calls[0] as unknown as [
      string,
      RequestInit & { body: string },
    ];
    expect(JSON.parse(init.body)).toEqual({
      clientId: "c",
      refreshToken: "r",
      accessToken: "a",
      scope: "user-read-private",
      expiresIn: 3600,
    });
  });

  it("traduit INVALID_FIELD", async () => {
    mockFetchOnce({ ok: false, code: "INVALID_FIELD" }, 400);
    expect(
      await sendSpotifyToken("192.168.1.42", 43178, {
        clientId: "c",
        refreshToken: "r",
      })
    ).toEqual({ ok: false, error: "Champ Spotify invalide : vérifie la demande." });
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
    expect(
      await sendSpotifyToken("192.168.1.42", 43178, {
        clientId: "c",
        refreshToken: "r",
      })
    ).toEqual({ ok: false, error: "Aucune réponse du Desktop en 4 s." });
  });
});

describe("fetchSpotifyDevices", () => {
  it("lit /api/spotify/devices et parse la liste", async () => {
    const fetchMock = mockFetchOnce({ ok: true, devices: [DEVICE] });
    const result = await fetchSpotifyDevices("192.168.1.42", 43178);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.devices).toEqual([DEVICE]);
    expect((fetchMock.mock.calls[0] as unknown as [string])[0]).toBe(
      "http://192.168.1.42:43178/api/spotify/devices"
    );
  });

  it("retourne une erreur sur réponse 200 invalide", async () => {
    mockFetchOnce({ ok: true, devices: [{ id: "x" }] }, 200);
    expect(await fetchSpotifyDevices("192.168.1.42", 43178)).toEqual({
      ok: false,
      error: "Liste des appareils Spotify invalide.",
    });
  });

  it("retourne une erreur HTTP exploitable", async () => {
    mockFetchOnce({ ok: false }, 500);
    expect(await fetchSpotifyDevices("192.168.1.42", 43178)).toEqual({
      ok: false,
      error: "HTTP 500 sur la liste des appareils Spotify.",
    });
  });
});

describe("setSpotifyAlias", () => {
  it("poste id + alias sur /api/spotify/devices/aliases", async () => {
    const fetchMock = mockFetchOnce({ ok: true }, 200);
    const result = await setSpotifyAlias("192.168.1.42", 43178, {
      id: "dev-1",
      alias: "TV Salon",
    });
    expect(result).toEqual({ ok: true });
    const [url, init] = fetchMock.mock.calls[0] as unknown as [
      string,
      RequestInit & { body: string },
    ];
    expect(url).toBe("http://192.168.1.42:43178/api/spotify/devices/aliases");
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body)).toEqual({ id: "dev-1", alias: "TV Salon" });
  });

  it("traduit INVALID_FIELD", async () => {
    mockFetchOnce({ ok: false, code: "INVALID_FIELD" }, 400);
    expect(
      await setSpotifyAlias("192.168.1.42", 43178, { id: "dev-1", alias: "" })
    ).toEqual({ ok: false, error: "Champ Spotify invalide : vérifie la demande." });
  });
});

describe("setSpotifyDefault", () => {
  it("poste defaultId (chaîne) sur /api/spotify/devices/aliases", async () => {
    const fetchMock = mockFetchOnce({ ok: true }, 200);
    const result = await setSpotifyDefault("192.168.1.42", 43178, "dev-1");
    expect(result).toEqual({ ok: true });
    const [, init] = fetchMock.mock.calls[0] as unknown as [
      string,
      RequestInit & { body: string },
    ];
    expect(JSON.parse(init.body)).toEqual({ defaultId: "dev-1" });
  });

  it("poste defaultId null pour aucun appareil par défaut", async () => {
    const fetchMock = mockFetchOnce({ ok: true }, 200);
    await setSpotifyDefault("192.168.1.42", 43178, null);
    const [, init] = fetchMock.mock.calls[0] as unknown as [
      string,
      RequestInit & { body: string },
    ];
    expect(JSON.parse(init.body)).toEqual({ defaultId: null });
  });
});

describe("spotifyControl", () => {
  it("poste l'action seule (query/device vides omis)", async () => {
    const fetchMock = mockFetchOnce({ ok: true }, 200);
    const result = await spotifyControl("192.168.1.42", 43178, { action: "pause" });
    expect(result).toEqual({ ok: true });
    const [url, init] = fetchMock.mock.calls[0] as unknown as [
      string,
      RequestInit & { body: string },
    ];
    expect(url).toBe("http://192.168.1.42:43178/api/spotify/control");
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body)).toEqual({ action: "pause" });
  });

  it("transmet query et device fournis", async () => {
    const fetchMock = mockFetchOnce({ ok: true }, 200);
    await spotifyControl("192.168.1.42", 43178, {
      action: "play",
      query: "Daft Punk",
      device: "TV Salon",
    });
    const [, init] = fetchMock.mock.calls[0] as unknown as [
      string,
      RequestInit & { body: string },
    ];
    expect(JSON.parse(init.body)).toEqual({
      action: "play",
      query: "Daft Punk",
      device: "TV Salon",
    });
  });

  it("conserve l'état additionnel d'une action status", async () => {
    mockFetchOnce({ ok: true, state: "playing" }, 200);
    const result = await spotifyControl("192.168.1.42", 43178, { action: "status" });
    expect(result).toEqual({ ok: true, state: "playing" });
  });

  it("traduit SPOTIFY_NO_DEVICE", async () => {
    mockFetchOnce({ ok: false, code: "SPOTIFY_NO_DEVICE" }, 409);
    expect(await spotifyControl("192.168.1.42", 43178, { action: "play" })).toEqual({
      ok: false,
      error:
        "Aucun appareil Spotify disponible. Ouvre l'app Spotify sur l'appareil cible.",
    });
  });

  it("traduit SPOTIFY_NOT_CONFIGURED et SPOGO_MISSING", async () => {
    mockFetchOnce({ ok: false, code: "SPOTIFY_NOT_CONFIGURED" }, 502);
    expect((await spotifyControl("192.168.1.42", 43178, { action: "play" })) as {
      error: string;
    }).toEqual({
      ok: false,
      error:
        "Spotify n'est pas connecté sur l'appliance. Connecte-toi depuis le téléphone.",
    });
    mockFetchOnce({ ok: false, code: "SPOGO_MISSING" }, 502);
    expect((await spotifyControl("192.168.1.42", 43178, { action: "play" })) as {
      error: string;
    }).toEqual({
      ok: false,
      error:
        "L'appliance n'a pas la commande spogo installée (image à mettre à jour).",
    });
  });

  it("traduit SPOTIFY_FAILED", async () => {
    mockFetchOnce({ ok: false, code: "SPOTIFY_FAILED" }, 502);
    expect(await spotifyControl("192.168.1.42", 43178, { action: "next" })).toEqual({
      ok: false,
      error: "L'action Spotify a échoué côté appliance.",
    });
  });

  it("retombe sur le message serveur pour un code inconnu", async () => {
    mockFetchOnce({ ok: false, code: "WHAT", message: "détail" }, 502);
    expect(await spotifyControl("192.168.1.42", 43178, { action: "next" })).toEqual({
      ok: false,
      error: "détail",
    });
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
    expect(await spotifyControl("192.168.1.42", 43178, { action: "play" })).toEqual({
      ok: false,
      error: "Aucune réponse du Desktop en 8 s.",
    });
  });
});

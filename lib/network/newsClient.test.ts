import { afterEach, describe, expect, it, vi } from "vitest";
import {
  addNewsFeed,
  fetchNewsStatus,
  parseNewsAdd,
  parseNewsRemove,
  parseNewsScan,
  parseNewsSetup,
  parseNewsStatus,
  removeNewsFeed,
  scanNews,
  setupNews,
} from "./newsClient";

/**
 * Tests du client « Revue de presse » (protocole 24/09/2026) : parsing sans
 * confiance des quatre routes, erreurs contractuelles exploitables, erreurs
 * reseau, et forme exacte des requetes (methode, URL, corps).
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

const FEED = {
  name: "xkcd",
  url: "https://xkcd.com",
  feedUrl: null,
  lastScanned: null,
};

/** Entree d'ajout (le contrat de `addNewsFeed` n'accepte pas `null`). */
const ADD_INPUT = { name: "xkcd", url: "https://xkcd.com" };

describe("parseNewsStatus", () => {
  it("parse un statut complet et ignore les champs inconnus", () => {
    const result = parseNewsStatus({
      ok: true,
      available: true,
      feeds: [
        {
          name: "xkcd",
          url: "https://xkcd.com",
          feedUrl: "https://xkcd.com/rss.xml",
          lastScanned: "2026-09-24T09:12:00.000Z",
        },
      ],
      unreadCount: 3,
      unknownField: "ignored",
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.status).toEqual({
        ok: true,
        available: true,
        feeds: [
          {
            name: "xkcd",
            url: "https://xkcd.com",
            feedUrl: "https://xkcd.com/rss.xml",
            lastScanned: "2026-09-24T09:12:00.000Z",
          },
        ],
        unreadCount: 3,
      });
    }
  });

  it("parse un statut indisponible (feeds vides, unreadCount null)", () => {
    const result = parseNewsStatus({
      ok: true,
      available: false,
      feeds: [],
      unreadCount: null,
    });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.status.unreadCount).toBeNull();
  });

  it("refuse ok=false, payload non objet et champs mal typés", () => {
    expect(parseNewsStatus({ ok: false }).ok).toBe(false);
    expect(parseNewsStatus(null).ok).toBe(false);
    expect(parseNewsStatus("news").ok).toBe(false);
    expect(
      parseNewsStatus({ ok: true, available: "yes", feeds: [], unreadCount: null }).ok
    ).toBe(false);
    expect(
      parseNewsStatus({ ok: true, available: true, feeds: {}, unreadCount: null }).ok
    ).toBe(false);
    expect(
      parseNewsStatus({ ok: true, available: true, feeds: [], unreadCount: -1 }).ok
    ).toBe(false);
    expect(
      parseNewsStatus({ ok: true, available: true, feeds: [], unreadCount: 1.5 }).ok
    ).toBe(false);
  });

  it("refuse une entree de flux non conforme", () => {
    expect(
      parseNewsStatus({
        ok: true,
        available: true,
        feeds: [{ name: "", url: "https://xkcd.com", feedUrl: null, lastScanned: null }],
        unreadCount: null,
      }).ok
    ).toBe(false);
    expect(
      parseNewsStatus({
        ok: true,
        available: true,
        feeds: [{ name: "xkcd", url: "https://xkcd.com", feedUrl: 42, lastScanned: null }],
        unreadCount: null,
      }).ok
    ).toBe(false);
    expect(
      parseNewsStatus({
        ok: true,
        available: true,
        feeds: [{ name: "xkcd", url: "https://xkcd.com", feedUrl: null }],
        unreadCount: null,
      }).ok
    ).toBe(false);
  });
});

describe("parseNewsAdd", () => {
  it("parse un ajout conforme", () => {
    const result = parseNewsAdd({ ok: true, feed: FEED });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.add.feed).toEqual(FEED);
  });

  it("refuse ok=false, feed absent ou non conforme", () => {
    expect(parseNewsAdd({ ok: false }).ok).toBe(false);
    expect(parseNewsAdd(null).ok).toBe(false);
    expect(parseNewsAdd({ ok: true }).ok).toBe(false);
    expect(
      parseNewsAdd({ ok: true, feed: { name: "xkcd", url: "", feedUrl: null, lastScanned: null } })
        .ok
    ).toBe(false);
  });
});

describe("parseNewsRemove", () => {
  it("parse une suppression conforme", () => {
    const result = parseNewsRemove({ ok: true });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.remove).toEqual({ ok: true });
  });

  it("refuse ok=false ou payload non objet", () => {
    expect(parseNewsRemove({ ok: false }).ok).toBe(false);
    expect(parseNewsRemove(null).ok).toBe(false);
  });
});

describe("parseNewsScan", () => {
  it("parse un resultat d'analyse complet", () => {
    const result = parseNewsScan({
      ok: true,
      newArticles: 4,
      feeds: [
        { name: "xkcd", newArticles: 4, totalFound: 4, source: "rss" },
        { name: "blog", newArticles: 0, totalFound: 0, source: "none", error: "timeout" },
      ],
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.scan.newArticles).toBe(4);
      expect(result.scan.feeds).toHaveLength(2);
      expect(result.scan.feeds[1]).toEqual({
        name: "blog",
        newArticles: 0,
        totalFound: 0,
        source: "none",
        error: "timeout",
      });
    }
  });

  it("refuse ok=false, compteur invalide et source inconnue", () => {
    expect(parseNewsScan({ ok: false }).ok).toBe(false);
    expect(parseNewsScan(null).ok).toBe(false);
    expect(parseNewsScan({ ok: true, newArticles: -1, feeds: [] }).ok).toBe(false);
    expect(parseNewsScan({ ok: true, newArticles: 1, feeds: {} }).ok).toBe(false);
    expect(
      parseNewsScan({
        ok: true,
        newArticles: 1,
        feeds: [{ name: "xkcd", newArticles: 1, totalFound: 1, source: "ftp" }],
      }).ok
    ).toBe(false);
  });
});

describe("fetchNewsStatus", () => {
  it("lit /api/news/status et parse la réponse", async () => {
    const fetchMock = mockFetchOnce({
      ok: true,
      available: true,
      feeds: [FEED],
      unreadCount: 3,
    });

    const result = await fetchNewsStatus("192.168.1.42", 43178);

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.unreadCount).toBe(3);
    expect((fetchMock.mock.calls[0] as unknown as [string])[0]).toBe(
      "http://192.168.1.42:43178/api/news/status"
    );
  });

  it("retourne une erreur HTTP exploitable", async () => {
    mockFetchOnce({ ok: false }, 500);
    const result = await fetchNewsStatus("192.168.1.42", 43178);
    expect(result).toEqual({
      ok: false,
      error: "HTTP 500 sur le statut de la revue de presse.",
    });
  });

  it("retourne une erreur reseau redactee sans crash", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new TypeError("Network request failed");
      })
    );
    const result = await fetchNewsStatus("192.168.1.42", 43178);
    expect(result).toEqual({
      ok: false,
      error: "Desktop injoignable : vérifie l'IP, le port et le même Wi-Fi.",
    });
  });

  it("refuse des coordonnées invalides sans appel réseau", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const result = await fetchNewsStatus("desktop.local", 43178);
    expect(result.ok).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("addNewsFeed", () => {
  it("poste name + url sur /api/news/feeds", async () => {
    const fetchMock = mockFetchOnce({ ok: true, feed: FEED }, 200);

    const result = await addNewsFeed("192.168.1.42", 43178, {
      name: "xkcd",
      url: "https://xkcd.com",
    });

    expect(result.ok).toBe(true);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [
      string,
      RequestInit & { body: string },
    ];
    expect(url).toBe("http://192.168.1.42:43178/api/news/feeds");
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body)).toEqual({
      name: "xkcd",
      url: "https://xkcd.com",
    });
  });

  it("transmet feedUrl quand fourni", async () => {
    const fetchMock = mockFetchOnce({ ok: true, feed: FEED }, 200);
    await addNewsFeed("192.168.1.42", 43178, {
      name: "xkcd",
      url: "https://xkcd.com",
      feedUrl: "https://xkcd.com/rss.xml",
    });
    const [, init] = fetchMock.mock.calls[0] as unknown as [
      string,
      RequestInit & { body: string },
    ];
    expect(JSON.parse(init.body)).toEqual({
      name: "xkcd",
      url: "https://xkcd.com",
      feedUrl: "https://xkcd.com/rss.xml",
    });
  });

  it("traduit DUPLICATE et INVALID_FIELD", async () => {
    mockFetchOnce({ ok: false, code: "DUPLICATE" }, 409);
    expect(await addNewsFeed("192.168.1.42", 43178, ADD_INPUT)).toEqual({
      ok: false,
      error: "Ce flux est déjà suivi (même nom ou même adresse).",
    });
    mockFetchOnce({ ok: false, code: "INVALID_FIELD" }, 400);
    expect(await addNewsFeed("192.168.1.42", 43178, ADD_INPUT)).toEqual({
      ok: false,
      error: "Champ invalide : vérifie le nom et l'adresse du flux.",
    });
  });

  it("traduit BLOGWATCHER_MISSING", async () => {
    mockFetchOnce({ ok: false, code: "BLOGWATCHER_MISSING" }, 502);
    expect(await addNewsFeed("192.168.1.42", 43178, ADD_INPUT)).toEqual({
      ok: false,
      error:
        "L'appliance n'a pas la commande blogwatcher installée (image à mettre à jour).",
    });
  });

  it("traduit BLOGWATCHER_OUTPUT_UNREADABLE", async () => {
    mockFetchOnce({ ok: false, code: "BLOGWATCHER_OUTPUT_UNREADABLE" }, 502);
    expect(await addNewsFeed("192.168.1.42", 43178, ADD_INPUT)).toEqual({
      ok: false,
      error: "L'appliance n'a pas pu lire la réponse de blogwatcher.",
    });
  });

  it("retombe sur le message serveur pour un code inconnu", async () => {
    mockFetchOnce({ ok: false, code: "WHAT", message: "détail" }, 502);
    expect(await addNewsFeed("192.168.1.42", 43178, ADD_INPUT)).toEqual({
      ok: false,
      error: "détail",
    });
  });

  it("retourne une erreur sur réponse 200 invalide", async () => {
    mockFetchOnce({ ok: true, feed: { name: "xkcd" } }, 200);
    expect(await addNewsFeed("192.168.1.42", 43178, ADD_INPUT)).toEqual({
      ok: false,
      error: "Réponse d'ajout de flux invalide.",
    });
  });
});

describe("removeNewsFeed", () => {
  it("poste le nom sur /api/news/feeds/remove", async () => {
    const fetchMock = mockFetchOnce({ ok: true }, 200);

    const result = await removeNewsFeed("192.168.1.42", 43178, "xkcd");

    expect(result).toEqual({ ok: true });
    const [url, init] = fetchMock.mock.calls[0] as unknown as [
      string,
      RequestInit & { body: string },
    ];
    expect(url).toBe("http://192.168.1.42:43178/api/news/feeds/remove");
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body)).toEqual({ name: "xkcd" });
  });

  it("traduit NOT_FOUND", async () => {
    mockFetchOnce({ ok: false, code: "NOT_FOUND" }, 404);
    expect(await removeNewsFeed("192.168.1.42", 43178, "xkcd")).toEqual({
      ok: false,
      error: "Ce flux n'est plus suivi par l'appliance.",
    });
  });

  it("retourne une erreur HTTP exploitable", async () => {
    mockFetchOnce({ ok: false }, 500);
    expect(await removeNewsFeed("192.168.1.42", 43178, "xkcd")).toEqual({
      ok: false,
      error: "HTTP 500 pendant la suppression du flux.",
    });
  });
});

describe("scanNews", () => {
  it("poste un corps vide sur /api/news/scan et parse le résultat", async () => {
    const fetchMock = mockFetchOnce(
      {
        ok: true,
        newArticles: 4,
        feeds: [{ name: "xkcd", newArticles: 4, totalFound: 4, source: "rss" }],
      },
      200
    );

    const result = await scanNews("192.168.1.42", 43178);

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.newArticles).toBe(4);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("http://192.168.1.42:43178/api/news/scan");
    expect(init.method).toBe("POST");
    expect(init.body).toBeUndefined();
  });

  it("traduit BLOGWATCHER_SCAN_FAILED", async () => {
    mockFetchOnce({ ok: false, code: "BLOGWATCHER_SCAN_FAILED" }, 502);
    expect(await scanNews("192.168.1.42", 43178)).toEqual({
      ok: false,
      error: "L'analyse des flux a échoué côté appliance.",
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
    const result = await scanNews("192.168.1.42", 43178);
    expect(result).toEqual({ ok: false, error: "Aucune réponse du Desktop en 70 s." });
  });
});

describe("parseNewsSetup", () => {
  it("parse une installation conforme et ignore les champs inconnus", () => {
    const result = parseNewsSetup({
      ok: true,
      installed: true,
      available: true,
      version: "0.0.4",
      unknownField: "ignored",
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.setup).toEqual({
        ok: true,
        installed: true,
        available: true,
        version: "0.0.4",
      });
    }
  });

  it("parse le cas idempotent (déjà installé)", () => {
    const result = parseNewsSetup({
      ok: true,
      installed: false,
      available: true,
      version: "0.0.4",
    });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.setup.installed).toBe(false);
  });

  it("refuse ok=false, payload non objet et champs mal typés", () => {
    expect(parseNewsSetup({ ok: false }).ok).toBe(false);
    expect(parseNewsSetup(null).ok).toBe(false);
    expect(parseNewsSetup("setup").ok).toBe(false);
    expect(
      parseNewsSetup({ ok: true, installed: "yes", available: true, version: "0.0.4" }).ok
    ).toBe(false);
    expect(
      parseNewsSetup({ ok: true, installed: true, available: true, version: "" }).ok
    ).toBe(false);
    expect(
      parseNewsSetup({ ok: true, installed: true, available: true }).ok
    ).toBe(false);
  });
});

describe("setupNews", () => {
  it("poste un corps vide sur /api/news/setup et parse le résultat", async () => {
    const fetchMock = mockFetchOnce(
      { ok: true, installed: true, available: true, version: "0.0.4" },
      200
    );

    const result = await setupNews("192.168.1.42", 43178);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.installed).toBe(true);
      expect(result.version).toBe("0.0.4");
    }
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("http://192.168.1.42:43178/api/news/setup");
    expect(init.method).toBe("POST");
    expect(init.body).toBeUndefined();
  });

  it("traduit BLOGWATCHER_INSTALL_FAILED", async () => {
    mockFetchOnce({ ok: false, code: "BLOGWATCHER_INSTALL_FAILED" }, 502);
    expect(await setupNews("192.168.1.42", 43178)).toEqual({
      ok: false,
      error:
        "L'installation du binaire blogwatcher a échoué côté appliance (réseau ?).",
    });
  });

  it("retourne une erreur HTTP exploitable", async () => {
    mockFetchOnce({ ok: false }, 500);
    expect(await setupNews("192.168.1.42", 43178)).toEqual({
      ok: false,
      error: "HTTP 500 pendant l'installation de blogwatcher.",
    });
  });

  it("retourne une erreur sur réponse 200 invalide", async () => {
    mockFetchOnce({ ok: true, installed: true, available: true, version: "" }, 200);
    expect(await setupNews("192.168.1.42", 43178)).toEqual({
      ok: false,
      error: "Résultat d'installation de blogwatcher invalide.",
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
    expect(await setupNews("192.168.1.42", 43178)).toEqual({
      ok: false,
      error: "Aucune réponse du Desktop en 70 s.",
    });
  });

  it("refuse des coordonnées invalides sans appel réseau", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const result = await setupNews("desktop.local", 43178);
    expect(result.ok).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

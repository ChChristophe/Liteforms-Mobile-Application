import { afterEach, describe, expect, it, vi } from "vitest";
import {
  buildAuthorizeUrl,
  createCodeChallenge,
  createCodeVerifier,
  exchangeCodeForTokens,
  parseTokenResponse,
  toBase64Url,
} from "./spotifyAuth";

/**
 * Tests du coeur PKCE Spotify (protocole 24/09/2026) : aucune session OAuth
 * n'est ouverte. `expo-crypto` est remplace par une implementation Node
 * equivalente pour rendre le challenge deterministe (vecteur RFC 7636).
 */

vi.mock("expo-crypto", async () => {
  // `as string` : import dynamique volontairement non type (pas de @types/node
  // dans le projet) ; le mock reste local aux tests.
  const nodeCrypto = await import("node:crypto" as string);
  const createHash = nodeCrypto.createHash as (
    algorithm: string
  ) => { update(data: string): { digest(encoding: string): string } };
  return {
    CryptoDigestAlgorithm: { SHA256: "SHA-256" },
    CryptoEncoding: { BASE64: "base64", HEX: "hex" },
    getRandomValues: (typedArray: Uint8Array): Uint8Array => {
      for (let i = 0; i < typedArray.length; i += 1) typedArray[i] = i % 256;
      return typedArray;
    },
    digestStringAsync: async (
      _algorithm: string,
      data: string,
      options?: { encoding?: string }
    ): Promise<string> =>
      createHash("sha256")
        .update(data)
        .digest(options?.encoding === "base64" ? "base64" : "hex"),
  };
});

afterEach(() => {
  vi.unstubAllGlobals();
});

/** Vecteur de test officiel RFC 7636, Appendix B. */
const RFC_VERIFIER = "dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk";
const RFC_CHALLENGE = "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM";

describe("toBase64Url", () => {
  it("remplace + / et retire le padding", () => {
    expect(toBase64Url("a+b/c==")).toBe("a-b_c");
    expect(toBase64Url("abc")).toBe("abc");
  });
});

describe("createCodeVerifier", () => {
  it("produit un verifier hex de longueur conforme (43-128)", () => {
    const verifier = createCodeVerifier(4);
    expect(verifier).toBe("00010203");
    expect(createCodeVerifier().length).toBe(64);
    expect(createCodeVerifier()).toMatch(/^[0-9a-f]+$/);
  });
});

describe("createCodeChallenge", () => {
  it("reproduit le vecteur RFC 7636 (S256)", async () => {
    expect(await createCodeChallenge(RFC_VERIFIER)).toBe(RFC_CHALLENGE);
  });
});

describe("buildAuthorizeUrl", () => {
  it("construit l'URL d'autorisation avec les parametres PKCE attendus", () => {
    const url = buildAuthorizeUrl({
      clientId: "client-123",
      redirectUri: "com.liteforms.app://callback",
      codeChallenge: RFC_CHALLENGE,
      state: "state-123",
    });
    const parsed = new URL(url);
    expect(parsed.origin + parsed.pathname).toBe(
      "https://accounts.spotify.com/authorize"
    );
    expect(parsed.searchParams.get("response_type")).toBe("code");
    expect(parsed.searchParams.get("client_id")).toBe("client-123");
    expect(parsed.searchParams.get("redirect_uri")).toBe(
      "com.liteforms.app://callback"
    );
    expect(parsed.searchParams.get("code_challenge")).toBe(RFC_CHALLENGE);
    expect(parsed.searchParams.get("code_challenge_method")).toBe("S256");
    expect(parsed.searchParams.get("state")).toBe("state-123");
    expect(parsed.searchParams.get("scope")).toContain("user-read-private");
    expect(parsed.searchParams.get("scope")?.split(" ").length).toBe(14);
  });

  it("ajoute show_dialog quand demande", () => {
    const url = buildAuthorizeUrl({
      clientId: "c",
      redirectUri: "com.liteforms.app://callback",
      codeChallenge: "challenge",
      state: "s",
      showDialog: true,
    });
    expect(new URL(url).searchParams.get("show_dialog")).toBe("true");
  });
});

describe("parseTokenResponse", () => {
  it("parse une reponse conforme", () => {
    const result = parseTokenResponse({
      access_token: "access",
      refresh_token: "refresh",
      expires_in: 3600,
      scope: "user-read-private",
      token_type: "Bearer",
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.tokens).toEqual({
        accessToken: "access",
        refreshToken: "refresh",
        scope: "user-read-private",
        expiresIn: 3600,
        tokenType: "Bearer",
      });
    }
  });

  it("refuse un payload sans refresh_token ou sans access_token", () => {
    expect(parseTokenResponse({ access_token: "a" }).ok).toBe(false);
    expect(parseTokenResponse({ refresh_token: "r" }).ok).toBe(false);
    expect(parseTokenResponse(null).ok).toBe(false);
  });
});

describe("exchangeCodeForTokens", () => {
  it("poste le code et le verifier en form-urlencoded", async () => {
    const fetchMock = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            access_token: "a",
            refresh_token: "r",
            expires_in: 3600,
            token_type: "Bearer",
            scope: "user-read-private",
          }),
          { status: 200 }
        )
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = await exchangeCodeForTokens({
      code: "the-code",
      codeVerifier: RFC_VERIFIER,
      redirectUri: "com.liteforms.app://callback",
    });

    expect(result.ok).toBe(true);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [
      string,
      RequestInit & { body: string; headers: Record<string, string> },
    ];
    expect(url).toBe("https://accounts.spotify.com/api/token");
    expect(init.method).toBe("POST");
    expect(init.headers["Content-Type"]).toBe("application/x-www-form-urlencoded");
    const body = new URLSearchParams(init.body);
    expect(body.get("grant_type")).toBe("authorization_code");
    expect(body.get("code")).toBe("the-code");
    expect(body.get("code_verifier")).toBe(RFC_VERIFIER);
    expect(body.get("redirect_uri")).toBe("com.liteforms.app://callback");
  });

  it("traduit une erreur OAuth invalid_grant", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(JSON.stringify({ error: "invalid_grant" }), { status: 400 })
      )
    );
    const result = await exchangeCodeForTokens({
      code: "bad",
      codeVerifier: RFC_VERIFIER,
      redirectUri: "com.liteforms.app://callback",
    });
    expect(result).toEqual({
      ok: false,
      error: "Code d'autorisation Spotify invalide ou expiré. Réessaie la connexion.",
    });
  });

  it("refuse une 200 sans refresh_token", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(JSON.stringify({ access_token: "a" }), { status: 200 })
      )
    );
    const result = await exchangeCodeForTokens({
      code: "c",
      codeVerifier: RFC_VERIFIER,
      redirectUri: "com.liteforms.app://callback",
    });
    expect(result).toEqual({
      ok: false,
      error: "Spotify n'a pas renvoyé de refresh token.",
    });
  });

  it("ne crash pas sur un timeout reseau (AbortError)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        const error = new Error("Aborted");
        error.name = "AbortError";
        throw error;
      })
    );
    const result = await exchangeCodeForTokens({
      code: "c",
      codeVerifier: RFC_VERIFIER,
      redirectUri: "com.liteforms.app://callback",
    });
    expect(result).toEqual({ ok: false, error: "Spotify n'a pas répondu en 10 s." });
  });

  it("ne crash pas sur une reponse non JSON", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("<html>", { status: 502 }))
    );
    const result = await exchangeCodeForTokens({
      code: "c",
      codeVerifier: RFC_VERIFIER,
      redirectUri: "com.liteforms.app://callback",
    });
    expect(result.ok).toBe(false);
  });
});

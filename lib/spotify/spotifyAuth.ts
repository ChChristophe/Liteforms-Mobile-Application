import * as Crypto from "expo-crypto";
import {
  SPOTIFY_AUTHORIZE_ENDPOINT,
  SPOTIFY_CLIENT_ID,
  SPOTIFY_SCOPES,
  SPOTIFY_TOKEN_ENDPOINT,
} from "./config";

/**
 * Coeur PKCE du flux Spotify (Authorization Code + PKCE, public client,
 * RFC 7636). Protocole 24/09/2026 : le Mobile obtient `access_token` /
 * `refresh_token` puis les transfere a l'appliance ; il ne les stocke jamais.
 *
 * Ce module est volontairement **sans navigateur ni dependance RN** : les tests
 * n'ouvrent aucune session OAuth. L'ouverture du navigateur et la verification
 * d'etat CSRF sont deleguees a `expo-auth-session` par l'ecran ; ce module
 * fournit les primitives testables (verifier, challenge, URL, echange token).
 */

/** Timeout du POST token (reseau accounts.spotify.com). */
const TOKEN_TIMEOUT_MS = 10000;

/**
 * Encode une chaine base64 standard en base64url sans padding, comme exige par
 * PKCE (`code_challenge`).
 */
export function toBase64Url(base64: string): string {
  return base64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/**
 * Genere un `code_verifier` PKCE : octets aleatoires cryptographiques encodes
 * en hex (43 a 128 caracteres de l'alphabet non reserve, conforme RFC 7636).
 *
 * @param byteLength nombre d'octets aleatoires (32 par defaut -> 64 caracteres).
 */
export function createCodeVerifier(byteLength = 32): string {
  const bytes = Crypto.getRandomValues(new Uint8Array(byteLength));
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

/**
 * Calcule le `code_challenge` PKCE : base64url(SHA-256(code_verifier)).
 *
 * @param codeVerifier verifier produit par `createCodeVerifier`.
 */
export async function createCodeChallenge(codeVerifier: string): Promise<string> {
  const base64 = await Crypto.digestStringAsync(
    Crypto.CryptoDigestAlgorithm.SHA256,
    codeVerifier,
    { encoding: Crypto.CryptoEncoding.BASE64 }
  );
  return toBase64Url(base64);
}

/** Parametres de construction de l'URL d'autorisation Spotify. */
export type SpotifyAuthorizeParams = {
  /** Client ID public. */
  clientId: string;
  /** URI de redirection enregistree cote Spotify. */
  redirectUri: string;
  /** `code_challenge` (base64url du SHA-256 du verifier). */
  codeChallenge: string;
  /** Jeton anti-CSRF, verifie par `expo-auth-session` au retour. */
  state: string;
  /** Scopes demandes (defaut : `SPOTIFY_SCOPES`). */
  scopes?: readonly string[];
  /** Force l'ecran de consentement Spotify (`show_dialog=true`). */
  showDialog?: boolean;
};

/**
 * Construit l'URL d'autorisation Spotify (Authorization Code + PKCE S256).
 * Fonction pure : aucune requete, aucun navigateur.
 */
export function buildAuthorizeUrl(params: SpotifyAuthorizeParams): string {
  const query = new URLSearchParams({
    response_type: "code",
    client_id: params.clientId,
    scope: (params.scopes ?? SPOTIFY_SCOPES).join(" "),
    redirect_uri: params.redirectUri,
    code_challenge: params.codeChallenge,
    code_challenge_method: "S256",
    state: params.state,
  });
  if (params.showDialog === true) query.set("show_dialog", "true");
  return `${SPOTIFY_AUTHORIZE_ENDPOINT}?${query.toString()}`;
}

/**
 * Tokens issus de l'echange de code. `refreshToken` est la source de verite
 * transmise a l'appliance ; il n'est jamais persiste cote Mobile.
 */
export type SpotifyTokenSet = {
  /** Access token initial. */
  accessToken: string;
  /** Refresh token (obligatoire : sans lui l'appliance ne peut rien rafraichir). */
  refreshToken: string;
  /** Scopes accordes, ou `null`. */
  scope: string | null;
  /** Duree de vie de l'access token en secondes, ou `null`. */
  expiresIn: number | null;
  /** Type de token (`Bearer`), ou `null`. */
  tokenType: string | null;
};

/** Resultat de `exchangeCodeForTokens`, exploitable par l'UI. */
export type SpotifyTokenExchangeResult =
  | { ok: true; tokens: SpotifyTokenSet }
  | { ok: false; error: string };

/** Parametres de l'echange code -> tokens. */
export type SpotifyExchangeParams = {
  /** Code d'autorisation recu par le redirect. */
  code: string;
  /** `code_verifier` ayant servi a produire le challenge envoye. */
  codeVerifier: string;
  /** Meme URI de redirection qu'a l'autorisation. */
  redirectUri: string;
  /** Client ID public (defaut : `SPOTIFY_CLIENT_ID`). */
  clientId?: string;
};

/** Messages utilisateur des erreurs OAuth de l'endpoint token Spotify. */
const TOKEN_ERROR_MESSAGES: Record<string, string> = {
  invalid_grant:
    "Code d'autorisation Spotify invalide ou expiré. Réessaie la connexion.",
  invalid_client: "Client ID Spotify refusé par Spotify.",
  invalid_request: "Requête d'échange de token Spotify invalide.",
  unauthorized_client:
    "Application Spotify non autorisée pour cette méthode de connexion.",
  unsupported_grant_type: "Type de connexion Spotify non supporté.",
};

/**
 * Valide la reponse JSON de `POST /api/token` sans lui faire confiance.
 * `access_token` et `refresh_token` doivent etre des chaines non vides.
 *
 * @param value corps, typiquement `await response.json()`.
 */
export function parseTokenResponse(value: unknown):
  | { ok: true; tokens: SpotifyTokenSet }
  | { ok: false; error: string } {
  if (typeof value !== "object" || value === null) {
    return { ok: false, error: "Réponse token Spotify non JSON ou vide." };
  }
  const r = value as Record<string, unknown>;
  if (typeof r.access_token !== "string" || r.access_token.length === 0) {
    return { ok: false, error: "Réponse token Spotify sans access_token." };
  }
  if (typeof r.refresh_token !== "string" || r.refresh_token.length === 0) {
    return {
      ok: false,
      error: "Spotify n'a pas renvoyé de refresh token.",
    };
  }
  const expiresIn =
    typeof r.expires_in === "number" && Number.isFinite(r.expires_in)
      ? r.expires_in
      : null;
  return {
    ok: true,
    tokens: {
      accessToken: r.access_token,
      refreshToken: r.refresh_token,
      scope: typeof r.scope === "string" ? r.scope : null,
      expiresIn,
      tokenType: typeof r.token_type === "string" ? r.token_type : null,
    },
  };
}

/**
 * Echange le code d'autorisation contre des tokens :
 * `POST https://accounts.spotify.com/api/token` (form-urlencoded, PKCE, sans
 * secret). Erreurs OAuth traduites en francais ; aucune valeur de token
 * n'apparait dans les messages.
 *
 * @param params code + verifier + redirectUri (+ clientId optionnel).
 * @param timeoutMs delai max avant timeout (10 s par defaut).
 */
export async function exchangeCodeForTokens(
  params: SpotifyExchangeParams,
  timeoutMs: number = TOKEN_TIMEOUT_MS
): Promise<SpotifyTokenExchangeResult> {
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code: params.code,
    redirect_uri: params.redirectUri,
    client_id: params.clientId ?? SPOTIFY_CLIENT_ID,
    code_verifier: params.codeVerifier,
  });

  const controller = new AbortController();
  const abortTimer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(SPOTIFY_TOKEN_ENDPOINT, {
      method: "POST",
      signal: controller.signal,
      headers: {
        Accept: "application/json",
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: body.toString(),
    });
    const payload: unknown = await response.json().catch(() => null);
    if (!response.ok) {
      const r = payload as Record<string, unknown> | null;
      const code = r !== null && typeof r.error === "string" ? r.error : null;
      return {
        ok: false,
        error:
          (code !== null ? TOKEN_ERROR_MESSAGES[code] : undefined) ??
          `HTTP ${response.status} pendant l'échange du token Spotify.`,
      };
    }
    return parseTokenResponse(payload);
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      return { ok: false, error: `Spotify n'a pas répondu en ${timeoutMs / 1000} s.` };
    }
    if (error instanceof TypeError) {
      return { ok: false, error: "Spotify injoignable (vérifie ta connexion Internet)." };
    }
    return { ok: false, error: "Erreur inconnue pendant la connexion Spotify." };
  } finally {
    clearTimeout(abortTimer);
  }
}

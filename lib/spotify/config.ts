/**
 * Configuration Spotify du Mobile (protocole 24/09/2026,
 * `DEVICE_API.md` §« Spotify — connexion, appareils et controle »).
 *
 * Aucun secret ici : le client est **public** (Authorization Code + PKCE) et le
 * Client ID est fait pour etre embarque. Le Mobile n'obtient que des tokens
 * utilisateur, qu'il transfere aussitot a l'appliance — il n'en garde rien.
 */

/** Client ID public de Liteforms (application Spotify Developer « Liteforms »). */
export const SPOTIFY_CLIENT_ID = "f2a5796d067c4ee5a12709d8d9da3a7a";

/** Scheme profond enregistre par l'app (`expo.scheme` = `com.liteforms.app`). */
const SPOTIFY_REDIRECT_URI = "com.liteforms.app://callback";

/**
 * Scopes demandes, **identiques a ceux de la CLI appliance** (spogo). L'ordre
 * est significatif pour la lisibilite du consentement, pas pour Spotify.
 */
export const SPOTIFY_SCOPES: readonly string[] = [
  "playlist-modify-private",
  "playlist-modify-public",
  "playlist-read-collaborative",
  "playlist-read-private",
  "user-follow-modify",
  "user-follow-read",
  "user-library-modify",
  "user-library-read",
  "user-modify-playback-state",
  "user-read-currently-playing",
  "user-read-playback-state",
  "user-read-private",
  "user-read-recently-played",
  "user-top-read",
];

/** Endpoint d'autorisation OAuth de Spotify. */
export const SPOTIFY_AUTHORIZE_ENDPOINT = "https://accounts.spotify.com/authorize";

/** Endpoint d'echange code -> tokens de Spotify. */
export const SPOTIFY_TOKEN_ENDPOINT = "https://accounts.spotify.com/api/token";

/**
 * URI de redirection OAuth, enregistree telle quelle dans le tableau de bord
 * Spotify Developer. Doit rester **exactement** `com.liteforms.app://callback`.
 */
export function spotifyRedirectUri(): string {
  return SPOTIFY_REDIRECT_URI;
}

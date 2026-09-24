import type {
  SpotifyAliasResponse,
  SpotifyAliasResult,
  SpotifyAuthAck,
  SpotifyAuthRequest,
  SpotifyAuthResult,
  SpotifyControlRequest,
  SpotifyControlResponse,
  SpotifyControlResult,
  SpotifyDevice,
  SpotifyDevicesResponse,
  SpotifyDevicesResult,
  SpotifyStatusResponse,
  SpotifyStatusResult,
} from "../../types/device";
import {
  buildDesktopUrl,
  describeNetworkFailure,
  validateHostPort,
} from "./deviceClient";
import { redactText } from "./networkErrors";

/**
 * Client Spotify du Mobile (protocole 24/09/2026, `DEVICE_API.md`
 * §« Spotify — connexion, appareils et controle (piloté par le Mobile) »).
 *
 * Flux : (1) le Mobile fait l'OAuth (Authorization Code + PKCE, cf.
 * `lib/spotify/spotifyAuth.ts`) et **transfere le refresh token** a
 * l'appliance ; (2) il **nomme les appareils** (alias) et choisit le defaut.
 * Le Mobile ne stocke aucun secret et ne parle jamais directement a Spotify
 * sur ces routes.
 *
 * Regles, identiques au reste du client LAN :
 * - `fetch` avec timeout explicite via `AbortController` ;
 * - reponses validees sans confiance (parsers) ;
 * - erreurs exploitables par l'UI et redactees, jamais de crash.
 */

/** Timeout des routes Spotify non bloquantes. */
const SPOTIFY_TIMEOUT_MS = 4000;

/**
 * Timeout de `POST /api/spotify/control` : une commande de lecture peut
 * attendre la reponse du device Spotify cible.
 */
const SPOTIFY_CONTROL_TIMEOUT_MS = 8000;

/**
 * Messages utilisateur des codes d'erreur contractuels des routes Spotify
 * (protocole : 400 `INVALID_FIELD`, 409 `SPOTIFY_NO_DEVICE`, 502
 * `SPOTIFY_NOT_CONFIGURED` | `SPOGO_MISSING` | `SPOTIFY_FAILED`).
 */
const SPOTIFY_ERROR_MESSAGES: Record<string, string> = {
  INVALID_FIELD: "Champ Spotify invalide : vérifie la demande.",
  SPOTIFY_NO_DEVICE:
    "Aucun appareil Spotify disponible. Ouvre l'app Spotify sur l'appareil cible.",
  SPOTIFY_NOT_CONFIGURED:
    "Spotify n'est pas connecté sur l'appliance. Connecte-toi depuis le téléphone.",
  SPOGO_MISSING:
    "L'appliance n'a pas la commande spogo installée (image à mettre à jour).",
  SPOTIFY_FAILED: "L'action Spotify a échoué côté appliance.",
};

/**
 * Valide le corps JSON de `GET /api/spotify/status` sans lui faire confiance.
 * Champs inconnus ignores ; `configured`/`available` doivent etre booleens.
 *
 * @param value corps, typiquement `await response.json()`.
 */
export function parseSpotifyStatus(value: unknown):
  | { ok: true; status: SpotifyStatusResponse }
  | { ok: false; error: string } {
  if (typeof value !== "object" || value === null) {
    return { ok: false, error: "Réponse Spotify non JSON ou vide." };
  }
  const r = value as Record<string, unknown>;
  if (
    r.ok !== true ||
    typeof r.configured !== "boolean" ||
    typeof r.available !== "boolean"
  ) {
    return { ok: false, error: "Statut Spotify invalide." };
  }
  return {
    ok: true,
    status: {
      ok: true,
      configured: r.configured,
      available: r.available,
    },
  };
}

/** Valide un appareil Spotify ; `null` si la forme ne correspond pas. */
function parseSpotifyDevice(value: unknown): SpotifyDevice | null {
  if (typeof value !== "object" || value === null) return null;
  const d = value as Record<string, unknown>;
  if (
    typeof d.id !== "string" ||
    d.id.length === 0 ||
    typeof d.name !== "string" ||
    typeof d.type !== "string" ||
    typeof d.isActive !== "boolean" ||
    (d.alias !== null && typeof d.alias !== "string") ||
    typeof d.isDefault !== "boolean"
  ) {
    return null;
  }
  return {
    id: d.id,
    name: d.name,
    type: d.type,
    isActive: d.isActive,
    alias: d.alias as string | null,
    isDefault: d.isDefault,
  };
}

/**
 * Valide le corps JSON de `GET /api/spotify/devices` sans lui faire confiance :
 * `ok !== true`, `devices` non tableau ou entree non conforme = erreur.
 *
 * @param value corps, typiquement `await response.json()`.
 */
export function parseSpotifyDevices(value: unknown):
  | { ok: true; devices: SpotifyDevicesResponse }
  | { ok: false; error: string } {
  if (typeof value !== "object" || value === null) {
    return { ok: false, error: "Réponse Spotify non JSON ou vide." };
  }
  const r = value as Record<string, unknown>;
  if (r.ok !== true || !Array.isArray(r.devices)) {
    return { ok: false, error: "Liste des appareils Spotify invalide." };
  }
  const devices: SpotifyDevice[] = [];
  for (const entry of r.devices) {
    const device = parseSpotifyDevice(entry);
    if (device === null) {
      return { ok: false, error: "Liste des appareils Spotify invalide." };
    }
    devices.push(device);
  }
  return { ok: true, devices: { ok: true, devices } };
}

/**
 * Valide le corps JSON de `POST /api/spotify/auth` en succes :
 * `ok !== true` ou `configured !== true`.
 *
 * @param value corps, typiquement `await response.json()`.
 */
export function parseSpotifyAuthAck(value: unknown):
  | { ok: true; ack: SpotifyAuthAck }
  | { ok: false; error: string } {
  if (typeof value !== "object" || value === null) {
    return { ok: false, error: "Réponse Spotify non JSON ou vide." };
  }
  const r = value as Record<string, unknown>;
  if (r.ok !== true || r.configured !== true) {
    return { ok: false, error: "Réponse de connexion Spotify invalide." };
  }
  return { ok: true, ack: { ok: true, configured: true } };
}

/**
 * Valide le corps JSON de `POST /api/spotify/devices/aliases` : `ok !== true`.
 *
 * @param value corps, typiquement `await response.json()`.
 */
export function parseSpotifyAlias(value: unknown):
  | { ok: true; alias: SpotifyAliasResponse }
  | { ok: false; error: string } {
  if (typeof value !== "object" || value === null) {
    return { ok: false, error: "Réponse Spotify non JSON ou vide." };
  }
  const r = value as Record<string, unknown>;
  if (r.ok !== true) {
    return { ok: false, error: "Réponse de mise à jour d'appareil Spotify invalide." };
  }
  return { ok: true, alias: { ok: true } };
}

/**
 * Valide le corps JSON de `POST /api/spotify/control` en succes : `ok !== true`.
 * Les champs additionnels (etat courant pour `status`) sont conserves.
 *
 * @param value corps, typiquement `await response.json()`.
 */
export function parseSpotifyControl(value: unknown):
  | { ok: true; control: SpotifyControlResponse }
  | { ok: false; error: string } {
  if (typeof value !== "object" || value === null) {
    return { ok: false, error: "Réponse Spotify non JSON ou vide." };
  }
  const r = value as Record<string, unknown>;
  if (r.ok !== true) {
    return { ok: false, error: "Réponse de contrôle Spotify invalide." };
  }
  return { ok: true, control: { ...r, ok: true } as SpotifyControlResponse };
}

/**
 * Traduit une erreur contractuelle `{ok:false, code, message}` en message
 * utilisateur. Les codes connus ont un libelle dedie ; sinon le message du
 * serveur est utilise (redacte), avec un repli generique.
 */
function describeSpotifyError(body: unknown, fallback: string): string {
  if (typeof body === "object" && body !== null) {
    const r = body as Record<string, unknown>;
    if (r.ok === false && typeof r.code === "string") {
      const known = SPOTIFY_ERROR_MESSAGES[r.code];
      if (known !== undefined) return known;
      if (typeof r.message === "string") return redactText(r.message);
      return r.code;
    }
  }
  return fallback;
}

/**
 * Transfere le token Spotify a l'appliance : `POST /api/spotify/auth`
 * (refresh token = source de verite, idempotent). L'appliance l'ecrit dans le
 * profil `spogo` et ne le renvoie jamais ; le Mobile n'en garde rien.
 *
 * @param host IPv4 de l'appliance.
 * @param port port HTTP de l'appliance.
 * @param payload `clientId` + `refreshToken` (+ accessToken/scope/expiresIn).
 * @param timeoutMs delai max avant timeout (4000 ms par defaut).
 */
export async function sendSpotifyToken(
  host: string,
  port: number,
  payload: SpotifyAuthRequest,
  timeoutMs: number = SPOTIFY_TIMEOUT_MS
): Promise<SpotifyAuthResult> {
  const coordinates = validateHostPort(host, port);
  if (!coordinates.ok) return { ok: false, error: coordinates.errors.join(" ") };

  const body: Record<string, unknown> = {
    clientId: payload.clientId,
    refreshToken: payload.refreshToken,
  };
  if (payload.accessToken !== undefined) body.accessToken = payload.accessToken;
  if (payload.scope !== undefined) body.scope = payload.scope;
  if (payload.expiresIn !== undefined) body.expiresIn = payload.expiresIn;

  const controller = new AbortController();
  const abortTimer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(`${buildDesktopUrl(host, port)}/api/spotify/auth`, {
      method: "POST",
      signal: controller.signal,
      headers: { Accept: "application/json", "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const responseBody: unknown = await response.json().catch(() => null);
    if (response.ok) {
      const parsed = parseSpotifyAuthAck(responseBody);
      return parsed.ok ? parsed.ack : { ok: false, error: parsed.error };
    }
    return {
      ok: false,
      error: describeSpotifyError(
        responseBody,
        `HTTP ${response.status} pendant l'envoi du token Spotify.`
      ),
    };
  } catch (error) {
    return {
      ok: false,
      error: redactText(describeNetworkFailure(error, timeoutMs)),
    };
  } finally {
    clearTimeout(abortTimer);
  }
}

/**
 * Lit le statut Spotify de l'appliance : `GET /api/spotify/status`.
 *
 * @param host IPv4 de l'appliance.
 * @param port port HTTP de l'appliance.
 * @param timeoutMs delai max avant timeout (4000 ms par defaut).
 */
export async function fetchSpotifyStatus(
  host: string,
  port: number,
  timeoutMs: number = SPOTIFY_TIMEOUT_MS
): Promise<SpotifyStatusResult> {
  const coordinates = validateHostPort(host, port);
  if (!coordinates.ok) return { ok: false, error: coordinates.errors.join(" ") };

  const controller = new AbortController();
  const abortTimer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(`${buildDesktopUrl(host, port)}/api/spotify/status`, {
      signal: controller.signal,
      headers: { Accept: "application/json" },
    });
    if (!response.ok) {
      return { ok: false, error: `HTTP ${response.status} sur le statut Spotify.` };
    }
    const parsed = parseSpotifyStatus(await response.json());
    return parsed.ok ? parsed.status : { ok: false, error: parsed.error };
  } catch (error) {
    return {
      ok: false,
      error: redactText(describeNetworkFailure(error, timeoutMs)),
    };
  } finally {
    clearTimeout(abortTimer);
  }
}

/**
 * Liste les appareils Spotify connus de l'appliance : `GET /api/spotify/devices`.
 *
 * @param host IPv4 de l'appliance.
 * @param port port HTTP de l'appliance.
 * @param timeoutMs delai max avant timeout (4000 ms par defaut).
 */
export async function fetchSpotifyDevices(
  host: string,
  port: number,
  timeoutMs: number = SPOTIFY_TIMEOUT_MS
): Promise<SpotifyDevicesResult> {
  const coordinates = validateHostPort(host, port);
  if (!coordinates.ok) return { ok: false, error: coordinates.errors.join(" ") };

  const controller = new AbortController();
  const abortTimer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(`${buildDesktopUrl(host, port)}/api/spotify/devices`, {
      signal: controller.signal,
      headers: { Accept: "application/json" },
    });
    if (!response.ok) {
      return {
        ok: false,
        error: `HTTP ${response.status} sur la liste des appareils Spotify.`,
      };
    }
    const parsed = parseSpotifyDevices(await response.json());
    return parsed.ok ? parsed.devices : { ok: false, error: parsed.error };
  } catch (error) {
    return {
      ok: false,
      error: redactText(describeNetworkFailure(error, timeoutMs)),
    };
  } finally {
    clearTimeout(abortTimer);
  }
}

/**
 * Nomme (ou efface) un appareil Spotify : `POST /api/spotify/devices/aliases`.
 *
 * @param host IPv4 de l'appliance.
 * @param port port HTTP de l'appliance.
 * @param payload `id` + `alias` (`alias` vide efface l'alias).
 * @param timeoutMs delai max avant timeout (4000 ms par defaut).
 */
export async function setSpotifyAlias(
  host: string,
  port: number,
  payload: { id: string; alias: string },
  timeoutMs: number = SPOTIFY_TIMEOUT_MS
): Promise<SpotifyAliasResult> {
  const coordinates = validateHostPort(host, port);
  if (!coordinates.ok) return { ok: false, error: coordinates.errors.join(" ") };

  const controller = new AbortController();
  const abortTimer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(
      `${buildDesktopUrl(host, port)}/api/spotify/devices/aliases`,
      {
        method: "POST",
        signal: controller.signal,
        headers: { Accept: "application/json", "Content-Type": "application/json" },
        body: JSON.stringify({ id: payload.id, alias: payload.alias }),
      }
    );
    const body: unknown = await response.json().catch(() => null);
    if (response.ok) {
      const parsed = parseSpotifyAlias(body);
      return parsed.ok ? parsed.alias : { ok: false, error: parsed.error };
    }
    return {
      ok: false,
      error: describeSpotifyError(
        body,
        `HTTP ${response.status} pendant le nommage de l'appareil.`
      ),
    };
  } catch (error) {
    return {
      ok: false,
      error: redactText(describeNetworkFailure(error, timeoutMs)),
    };
  } finally {
    clearTimeout(abortTimer);
  }
}

/**
 * Choisit l'appareil Spotify par defaut : `POST /api/spotify/devices/aliases`
 * avec `defaultId` (`null` = aucun).
 *
 * @param host IPv4 de l'appliance.
 * @param port port HTTP de l'appliance.
 * @param defaultId identifiant de l'appareil par defaut, ou `null`.
 * @param timeoutMs delai max avant timeout (4000 ms par defaut).
 */
export async function setSpotifyDefault(
  host: string,
  port: number,
  defaultId: string | null,
  timeoutMs: number = SPOTIFY_TIMEOUT_MS
): Promise<SpotifyAliasResult> {
  const coordinates = validateHostPort(host, port);
  if (!coordinates.ok) return { ok: false, error: coordinates.errors.join(" ") };

  const controller = new AbortController();
  const abortTimer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(
      `${buildDesktopUrl(host, port)}/api/spotify/devices/aliases`,
      {
        method: "POST",
        signal: controller.signal,
        headers: { Accept: "application/json", "Content-Type": "application/json" },
        body: JSON.stringify({ defaultId }),
      }
    );
    const body: unknown = await response.json().catch(() => null);
    if (response.ok) {
      const parsed = parseSpotifyAlias(body);
      return parsed.ok ? parsed.alias : { ok: false, error: parsed.error };
    }
    return {
      ok: false,
      error: describeSpotifyError(
        body,
        `HTTP ${response.status} pendant le choix de l'appareil par défaut.`
      ),
    };
  } catch (error) {
    return {
      ok: false,
      error: redactText(describeNetworkFailure(error, timeoutMs)),
    };
  } finally {
    clearTimeout(abortTimer);
  }
}

/**
 * Pilote la lecture Spotify via l'appliance : `POST /api/spotify/control`.
 * Seuls `action` et, si fournis non vides, `query`/`device` sont transmis.
 *
 * @param host IPv4 de l'appliance.
 * @param port port HTTP de l'appliance.
 * @param payload `action` (+ `query`/`device` optionnels).
 * @param timeoutMs delai max (8 s par defaut, commande de lecture).
 */
export async function spotifyControl(
  host: string,
  port: number,
  payload: SpotifyControlRequest,
  timeoutMs: number = SPOTIFY_CONTROL_TIMEOUT_MS
): Promise<SpotifyControlResult> {
  const coordinates = validateHostPort(host, port);
  if (!coordinates.ok) return { ok: false, error: coordinates.errors.join(" ") };

  const body: Record<string, string> = { action: payload.action };
  if (payload.query !== undefined && payload.query.trim().length > 0) {
    body.query = payload.query.trim();
  }
  if (payload.device !== undefined && payload.device.trim().length > 0) {
    body.device = payload.device.trim();
  }

  const controller = new AbortController();
  const abortTimer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(`${buildDesktopUrl(host, port)}/api/spotify/control`, {
      method: "POST",
      signal: controller.signal,
      headers: { Accept: "application/json", "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const responseBody: unknown = await response.json().catch(() => null);
    if (response.ok) {
      const parsed = parseSpotifyControl(responseBody);
      return parsed.ok ? parsed.control : { ok: false, error: parsed.error };
    }
    return {
      ok: false,
      error: describeSpotifyError(
        responseBody,
        `HTTP ${response.status} pendant la commande Spotify.`
      ),
    };
  } catch (error) {
    return {
      ok: false,
      error: redactText(describeNetworkFailure(error, timeoutMs)),
    };
  } finally {
    clearTimeout(abortTimer);
  }
}

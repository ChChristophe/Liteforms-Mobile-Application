import { DEVICE_CONFIG_VERSION } from "../../types/config";
import type {
  DesktopHealthCheck,
  DesktopHealthResponse,
  ProvisioningHealthResponse,
  WifiProvisioningRequest,
} from "../../types/device";
import { DESKTOP_PROTOCOL_VERSION } from "../../types/device";
import { DeviceNetworkError, redactText } from "./networkErrors";

/**
 * Client LAN Electron (PLAN.md Phase 6, premier flux).
 *
 * Regles implementees :
 * - `fetch` avec timeout explicite via `AbortController` ;
 * - distinction timeout / injoignable / HTTP non-2xx / payload invalide
 *   (`DeviceNetworkError`, pour l'UI) ;
 * - erreurs redactees (`redactText`) — aucune cle provider n'est jamais
 *   envoyee ni recue sur ces routes (D1) ;
 * - health du hotspot et health du reseau normal sans authentification v1 ;
 * - envoi du WiFi uniquement sur la route de provisioning du hotspot.
 *
 * Coordonnees validees ici (entree D3) : IPv4 de reference + port 1-65535.
 * Le DNS/nom d'hote est reporte (processus D3 : IP manuelle d'abord).
 */

/** Motif IPv4 strict (segments 0-255, pas de zero-padding). */
const IPV4_PATTERN =
  /^(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3}$/;

/** Timeout du health check : les LAN DOM ne sont pas garanties. */
const HEALTH_TIMEOUT_MS = 4000;

/**
 * Construit l'URL de base du Desktop et valide les coordonnees.
 *
 * @param host IPv4 du Desktop sur le LAN local (ex. "192.168.1.42").
 * @param port port HTTP du Desktop (ex. 5173).
 * @returns URL, forme `http://<host>:<port>`.
 * @throws DeviceNetworkError kind unknown si host/port sont hors contrat
 *   (l'appelant est cense les valider avant, via `validateHostPort`).
 */
export function buildDesktopUrl(host: string, port: number): string {
  if (!validateHostPort(host, port).ok) {
    throw new DeviceNetworkError(
      "unknown",
      `Coordonnees Desktop invalides: host="${host}" port=${port}`
    );
  }
  return `http://${host}:${port}`;
}

/**
 * Valide une adresse host/port pointant vers un Desktop Local.
 *
 * @returns raisons exploitables (sans valeurs) en cas d'echec.
 */
export function validateHostPort(
  host: string,
  port: number
): { ok: true } | { ok: false; errors: string[] } {
  const errors: string[] = [];
  if (!IPV4_PATTERN.test(host)) {
    errors.push("L'adresse doit être une IPv4 du réseau local (ex. 192.168.1.42).");
  }
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    errors.push("Le port doit être un entier entre 1 et 65535.");
  }
  return errors.length === 0 ? { ok: true } : { ok: false, errors };
}

/**
 * Valide le corps JSON de `GET /api/health` sans jamais lui faire confiance.
 *
 * Politique : les champs inconnus sont ignores ; `ok !== true`, `name`
 * non-texte ou `protocolVersion` non-texte sont des erreurs de payload.
 *
 * @param value corps, typiquement `await response.json()`.
 */
export function parseDesktopHealth(value: unknown):
  | { ok: true; health: DesktopHealthResponse }
  | { ok: false; error: string } {
  if (typeof value !== "object" || value === null) {
    return { ok: false, error: "Réponse Desktop non JSON ou vide." };
  }
  const r = value as Record<string, unknown>;
  if (r.ok !== true) {
    return {
      ok: false,
      error: "Route de santé Desktop répondue avec ok=false.",
    };
  }
  if (typeof r.name !== "string" || typeof r.protocolVersion !== "string") {
    return {
      ok: false,
      error: "Réponse Desktop incomplète (name / protocolVersion attendus).",
    };
  }
  const configVersions = Array.isArray(r.configVersions)
    ? (r.configVersions.filter((v) => typeof v === "string") as string[])
    : undefined;
  return {
    ok: true,
    health: {
      ok: true,
      name: r.name,
      protocolVersion: r.protocolVersion,
      ...(configVersions !== undefined ? { configVersions } : {}),
      ...(r.networkMode === "ethernet" ||
      r.networkMode === "wifi" ||
      r.networkMode === "provisioning"
        ? { networkMode: r.networkMode }
        : {}),
    },
  };
}

/** Valide le corps de `GET /api/provisioning/health`. */
export function parseProvisioningHealth(value: unknown):
  | { ok: true; health: ProvisioningHealthResponse }
  | { ok: false; error: string } {
  if (typeof value !== "object" || value === null) {
    return { ok: false, error: "Réponse de provisioning non JSON ou vide." };
  }
  const r = value as Record<string, unknown>;
  if (
    r.ok !== true ||
    r.mode !== "provisioning" ||
    typeof r.deviceId !== "string" ||
    typeof r.name !== "string" ||
    typeof r.protocolVersion !== "string"
  ) {
    return { ok: false, error: "Réponse de provisioning invalide." };
  }
  const port = typeof r.port === "number" && Number.isInteger(r.port) ? r.port : null;
  if (port === null) {
    return {
      ok: false,
      error: "Réponse de provisioning sans port effectif.",
    };
  }
  return {
    ok: true,
    health: {
      ok: true,
      mode: "provisioning",
      deviceId: r.deviceId,
      name: r.name,
      protocolVersion: r.protocolVersion,
      port,
    },
  };
}

/**
 * Ping la sante du Desktop : `GET /api/health` (sans authentification).
 *
 * @param host IPv4 du Desktop.
 * @param port port HTTP du Desktop.
 * @param timeoutMs delai max avant `kind: "timeout"` (4000 ms par defaut).
 * @returns `DesktopHealthCheck` : compatibilite protocole/config evaluee
 *   apres reponse, ou une erreur exploitable par l'UI.
 */
export async function fetchDesktopHealth(
  host: string,
  port: number,
  timeoutMs: number = HEALTH_TIMEOUT_MS
): Promise<DesktopHealthCheck> {
  const coordinates = validateHostPort(host, port);
  if (!coordinates.ok) {
    return { ok: false, error: coordinates.errors.join(" ") };
  }

  const controller = new AbortController();
  const abortTimer = setTimeout(() => controller.abort(), timeoutMs);
  let raw: unknown;
  try {
    const url = buildDesktopUrl(host, port);
    const response = await fetch(`${url}/api/health`, {
      signal: controller.signal,
      // Pointele : pas de cache LAN possible, il faut une reponse fraiche.
      headers: { Accept: "application/json" },
    });
    if (!response.ok) {
      throw new DeviceNetworkError(
        "http",
        `Le Desktop a répondu HTTP ${response.status} à ${url}/api/health`,
        response.status
      );
    }
    raw = await response.json();
  } catch (error) {
    return {
      ok: false,
      error: redactText(describeNetworkFailure(error, timeoutMs)),
    };
  } finally {
    clearTimeout(abortTimer);
  }

  const parsed = parseDesktopHealth(raw);
  if (!parsed.ok) {
    return { ok: false, error: parsed.error };
  }
  const { health } = parsed;
  if (health.networkMode === "provisioning") {
    return {
      ok: false,
      error: "Electron est encore en mode provisioning WiFi.",
    };
  }
  return {
    ok: true,
    desktopName: health.name,
    protocolVersionMatches: health.protocolVersion === DESKTOP_PROTOCOL_VERSION,
    configVersionSupported:
      health.configVersions === undefined
        ? true
        : health.configVersions.includes(DEVICE_CONFIG_VERSION),
  };
}

/**
 * Verifie le Desktop sur son hotspot temporaire.
 *
 * @param host IPv4 du hotspot, souvent `192.168.4.1`.
 * @param port port HTTP du service de provisioning.
 * @returns la reponse validee, ou une erreur sans mot de passe.
 */
export async function fetchProvisioningHealth(
  host: string,
  port: number,
  timeoutMs: number = HEALTH_TIMEOUT_MS
): Promise<
  | { ok: true; health: ProvisioningHealthResponse }
  | { ok: false; error: string }
> {
  const coordinates = validateHostPort(host, port);
  if (!coordinates.ok) return { ok: false, error: coordinates.errors.join(" ") };

  const controller = new AbortController();
  const abortTimer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(
      `${buildDesktopUrl(host, port)}/api/provisioning/health`,
      { signal: controller.signal, headers: { Accept: "application/json" } }
    );
    if (!response.ok) {
      return { ok: false, error: `HTTP ${response.status} du provisioning.` };
    }
    const parsed = parseProvisioningHealth(await response.json());
    return parsed.ok ? parsed : { ok: false, error: parsed.error };
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
 * Envoie les credentials WiFi au Desktop sur son hotspot temporaire.
 *
 * Le payload n'est jamais logge et le mot de passe ne doit pas etre conserve
 * dans un store Mobile. Le Desktop doit fermer le hotspot apres acceptation.
 */
export async function sendWifiProvisioning(
  host: string,
  port: number,
  payload: WifiProvisioningRequest,
  timeoutMs: number = HEALTH_TIMEOUT_MS
): Promise<{ ok: true } | { ok: false; error: string }> {
  const coordinates = validateHostPort(host, port);
  if (!coordinates.ok) return { ok: false, error: coordinates.errors.join(" ") };

  const controller = new AbortController();
  const abortTimer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(
      `${buildDesktopUrl(host, port)}/api/provisioning/wifi`,
      {
        method: "POST",
        signal: controller.signal,
        headers: { Accept: "application/json", "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      }
    );
    const body = (await response.json()) as { ok?: unknown; message?: unknown };
    if (!response.ok || body.ok !== true) {
      return {
          ok: false,
          error:
            typeof body.message === "string"
            ? redactText(body.message)
            : `HTTP ${response.status} pendant le provisioning WiFi.`,
      };
    }
    return { ok: true };
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
 * Traduit une exception fetch brute enmessage utilisateur, sans secret.
 *
 * - `AbortError` => `timeout` ;
 * - `TypeError` (fetch natif RN : reseau indisponible, DNS, refuse) =>
 *   `unreachable` ;
 * - le reste est decrit tel quel (redaction `redactText` par l'appelant).
 */
function describeNetworkFailure(
  error: unknown,
  timeoutMs: number
): string {
  if (error instanceof DeviceNetworkError) {
    return `Le Desktop a répondu avec le statut HTTP ${error.httpStatus ?? "?"}.`;
  }
  if (error instanceof Error && error.name === "AbortError") {
    return `Aucune réponse du Desktop en ${timeoutMs / 1000} s.`;
  }
  if (error instanceof TypeError) {
    return "Desktop injoignable : vérifie l'IP, le port et le même Wi-Fi.";
  }
  return error instanceof Error
    ? error.message
    : "Erreur réseau inconnue.";
}

import type {
  HuePairResponse,
  HuePairResult,
  HueStatusResponse,
  HueStatusResult,
  HueUnpairResponse,
  HueUnpairResult,
} from "../../types/device";
import {
  buildDesktopUrl,
  describeNetworkFailure,
  validateHostPort,
} from "./deviceClient";
import { redactText } from "./networkErrors";

/**
 * Client Philips Hue du Mobile (protocole 23/09/2026,
 * `DEVICE_API.md` §« Hue (Philips) — appairage pilote par le Mobile »).
 *
 * L'appliance est headless : l'activation et l'appairage sont declenches
 * depuis cet ecran, le seul geste physique etant l'appui sur le bouton du
 * bridge. Le Mobile ne parle jamais directement au bridge : il ne fait que
 * piloter les routes de l'appliance (aucune cle Hue ne transite ici).
 *
 * Regles, identiques au reste du client LAN :
 * - `fetch` avec timeout explicite via `AbortController` ;
 * - reponses validees sans confiance (parsers) ;
 * - erreurs exploitables par l'UI et redactees, jamais de crash.
 *
 * Timeouts : `pair` est une route **bloquante** (~35 s d'attente de l'appui
 * sur le bouton) -> 40 s ; status/unpair restent courts.
 */

/** Timeout des routes Hue non bloquantes (status, unpair). */
const HUE_TIMEOUT_MS = 4000;

/** Timeout de `POST /api/hue/pair` : la route attend l'appui (~35 s). */
const HUE_PAIR_TIMEOUT_MS = 40000;

/**
 * Messages utilisateur des codes d'erreur contractuels de `POST /api/hue/pair`
 * (protocole : 400 `INVALID_FIELD`, 502 `OPENHUE_MISSING` |
 * `HUE_BRIDGE_UNREACHABLE` | `HUE_PAIRING_TIMEOUT`).
 */
const HUE_ERROR_MESSAGES: Record<string, string> = {
  INVALID_FIELD: "Adresse du bridge Hue invalide.",
  OPENHUE_MISSING:
    "L'appliance n'a pas la commande openhue installée (image à mettre à jour).",
  HUE_BRIDGE_UNREACHABLE: "Bridge Hue injoignable sur le réseau.",
  HUE_PAIRING_TIMEOUT:
    "Appairage expiré : appuyez sur le bouton rond du bridge pendant la recherche.",
};

/**
 * Valide le corps JSON de `GET /api/hue/status` sans lui faire confiance.
 *
 * Champs inconnus ignores. `ok !== true`, `paired` non booleen, `bridgeIp`
 * ni chaine ni null, ou `lightCount` ni entier positif ni null sont des
 * erreurs de payload.
 *
 * @param value corps, typiquement `await response.json()`.
 */
export function parseHueStatus(value: unknown):
  | { ok: true; status: HueStatusResponse }
  | { ok: false; error: string } {
  if (typeof value !== "object" || value === null) {
    return { ok: false, error: "Réponse Hue non JSON ou vide." };
  }
  const r = value as Record<string, unknown>;
  const bridgeIpOk = r.bridgeIp === null || typeof r.bridgeIp === "string";
  const lightCountOk =
    r.lightCount === null ||
    (typeof r.lightCount === "number" &&
      Number.isInteger(r.lightCount) &&
      r.lightCount >= 0);
  if (r.ok !== true || typeof r.paired !== "boolean" || !bridgeIpOk || !lightCountOk) {
    return { ok: false, error: "Statut Hue invalide." };
  }
  return {
    ok: true,
    status: {
      ok: true,
      paired: r.paired,
      bridgeIp: r.bridgeIp as string | null,
      lightCount: r.lightCount as number | null,
    },
  };
}

/**
 * Valide le corps JSON de `POST /api/hue/pair` en succes : `ok !== true`,
 * `paired !== true` ou `bridgeIp` non-texte/vide sont des erreurs de payload.
 *
 * @param value corps, typiquement `await response.json()`.
 */
export function parseHuePair(value: unknown):
  | { ok: true; pair: HuePairResponse }
  | { ok: false; error: string } {
  if (typeof value !== "object" || value === null) {
    return { ok: false, error: "Réponse Hue non JSON ou vide." };
  }
  const r = value as Record<string, unknown>;
  if (
    r.ok !== true ||
    r.paired !== true ||
    typeof r.bridgeIp !== "string" ||
    r.bridgeIp.length === 0
  ) {
    return { ok: false, error: "Réponse d'appairage Hue invalide." };
  }
  return { ok: true, pair: { ok: true, paired: true, bridgeIp: r.bridgeIp } };
}

/**
 * Valide le corps JSON de `POST /api/hue/unpair` : `ok !== true` ou
 * `paired !== false` sont des erreurs de payload.
 *
 * @param value corps, typiquement `await response.json()`.
 */
export function parseHueUnpair(value: unknown):
  | { ok: true; unpair: HueUnpairResponse }
  | { ok: false; error: string } {
  if (typeof value !== "object" || value === null) {
    return { ok: false, error: "Réponse Hue non JSON ou vide." };
  }
  const r = value as Record<string, unknown>;
  if (r.ok !== true || r.paired !== false) {
    return { ok: false, error: "Réponse de désappairage Hue invalide." };
  }
  return { ok: true, unpair: { ok: true, paired: false } };
}

/**
 * Traduit une erreur contractuelle `{ok:false, code, message}` en message
 * utilisateur. Les codes connus ont un libelle dedie ; sinon le message du
 * serveur est utilise (redacte), avec un repli generique.
 */
function describeHueError(body: unknown, fallback: string): string {
  if (typeof body === "object" && body !== null) {
    const r = body as Record<string, unknown>;
    if (r.ok === false && typeof r.code === "string") {
      const known = HUE_ERROR_MESSAGES[r.code];
      if (known !== undefined) return known;
      if (typeof r.message === "string") return redactText(r.message);
      return r.code;
    }
  }
  return fallback;
}

/**
 * Lit le statut Hue de l'appliance : `GET /api/hue/status`.
 *
 * @param host IPv4 de l'appliance.
 * @param port port HTTP de l'appliance.
 * @param timeoutMs delai max avant timeout (4000 ms par defaut).
 */
export async function fetchHueStatus(
  host: string,
  port: number,
  timeoutMs: number = HUE_TIMEOUT_MS
): Promise<HueStatusResult> {
  const coordinates = validateHostPort(host, port);
  if (!coordinates.ok) return { ok: false, error: coordinates.errors.join(" ") };

  const controller = new AbortController();
  const abortTimer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(`${buildDesktopUrl(host, port)}/api/hue/status`, {
      signal: controller.signal,
      headers: { Accept: "application/json" },
    });
    if (!response.ok) {
      return { ok: false, error: `HTTP ${response.status} sur le statut Hue.` };
    }
    const parsed = parseHueStatus(await response.json());
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
 * Declenche l'appairage Hue depuis l'appliance : `POST /api/hue/pair`.
 *
 * **Route bloquante** : l'appliance attend l'appui sur le bouton du bridge
 * jusqu'a ~35 s ; l'UI doit afficher la consigne pendant l'appel. Idempotente
 * cote appliance (deja appaire = etat courant renvoye).
 *
 * @param host IPv4 de l'appliance.
 * @param port port HTTP de l'appliance.
 * @param bridgeIp IP du bridge, optionnelle (sinon decouverte automatique).
 * @param timeoutMs delai max (40 s par defaut, adapte a la route bloquante).
 */
export async function pairHue(
  host: string,
  port: number,
  bridgeIp?: string,
  timeoutMs: number = HUE_PAIR_TIMEOUT_MS
): Promise<HuePairResult> {
  const coordinates = validateHostPort(host, port);
  if (!coordinates.ok) return { ok: false, error: coordinates.errors.join(" ") };

  const controller = new AbortController();
  const abortTimer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(`${buildDesktopUrl(host, port)}/api/hue/pair`, {
      method: "POST",
      signal: controller.signal,
      headers: { Accept: "application/json", "Content-Type": "application/json" },
      body: JSON.stringify(bridgeIp ? { bridgeIp } : {}),
    });
    const body: unknown = await response.json().catch(() => null);
    if (response.ok) {
      const parsed = parseHuePair(body);
      return parsed.ok ? parsed.pair : { ok: false, error: parsed.error };
    }
    return {
      ok: false,
      error: describeHueError(
        body,
        `HTTP ${response.status} pendant l'appairage Hue.`
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
 * Purge la configuration Hue de l'appliance : `POST /api/hue/unpair`
 * (corps vide, idempotente). La cle Hue n'est jamais renvoyee.
 *
 * @param host IPv4 de l'appliance.
 * @param port port HTTP de l'appliance.
 * @param timeoutMs delai max avant timeout (4000 ms par defaut).
 */
export async function unpairHue(
  host: string,
  port: number,
  timeoutMs: number = HUE_TIMEOUT_MS
): Promise<HueUnpairResult> {
  const coordinates = validateHostPort(host, port);
  if (!coordinates.ok) return { ok: false, error: coordinates.errors.join(" ") };

  const controller = new AbortController();
  const abortTimer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(`${buildDesktopUrl(host, port)}/api/hue/unpair`, {
      method: "POST",
      signal: controller.signal,
      headers: { Accept: "application/json" },
    });
    const body: unknown = await response.json().catch(() => null);
    if (response.ok) {
      const parsed = parseHueUnpair(body);
      return parsed.ok ? parsed.unpair : { ok: false, error: parsed.error };
    }
    return {
      ok: false,
      error: describeHueError(
        body,
        `HTTP ${response.status} pendant le désappairage Hue.`
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

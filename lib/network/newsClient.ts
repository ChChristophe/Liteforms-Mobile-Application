import type {
  NewsAddResponse,
  NewsAddResult,
  NewsFeed,
  NewsRemoveResponse,
  NewsRemoveResult,
  NewsScanFeed,
  NewsScanResponse,
  NewsScanResult,
  NewsSetupResponse,
  NewsSetupResult,
  NewsStatusResponse,
  NewsStatusResult,
} from "../../types/device";
import {
  buildDesktopUrl,
  describeNetworkFailure,
  validateHostPort,
} from "./deviceClient";
import { redactText } from "./networkErrors";

/**
 * Client « Revue de presse » du Mobile (protocole 24/09/2026,
 * `DEVICE_API.md` §« Revue de presse (blogwatcher) — alimentation pilotee par
 * le Mobile »).
 *
 * L'appliance est headless : la liste des flux suivis (skill OpenClaw
 * `blogwatcher`) est geree depuis cet ecran, la lecture restant a la voix.
 * Le Mobile ne parle jamais directement aux flux : il ne fait que piloter les
 * routes de l'appliance. Aucun secret ne transite.
 *
 * Regles, identiques au reste du client LAN :
 * - `fetch` avec timeout explicite via `AbortController` ;
 * - reponses validees sans confiance (parsers) ;
 * - erreurs exploitables par l'UI et redactees, jamais de crash.
 *
 * Timeouts : `scan` est une route **bloquante** (l'appliance interroge le
 * reseau pour chaque flux, jusqu'a ~60 s) -> 70 s ; les autres routes restent
 * courtes.
 */

/** Timeout des routes news non bloquantes (status, add, remove). */
const NEWS_TIMEOUT_MS = 4000;

/** Timeout de `POST /api/news/scan` : route bloquante (~60 s d'analyse). */
const NEWS_SCAN_TIMEOUT_MS = 70000;

/** Timeout de `POST /api/news/setup` : route bloquante (~60 s de telechargement). */
const NEWS_SETUP_TIMEOUT_MS = 70000;

/**
 * Messages utilisateur des codes d'erreur contractuels des routes news
 * (protocole : 400 `INVALID_FIELD`, 409 `DUPLICATE`, 404 `NOT_FOUND`,
 * 502 `BLOGWATCHER_MISSING` | `BLOGWATCHER_OUTPUT_UNREADABLE` |
 * `BLOGWATCHER_SCAN_FAILED`).
 */
const NEWS_ERROR_MESSAGES: Record<string, string> = {
  INVALID_FIELD: "Champ invalide : vérifie le nom et l'adresse du flux.",
  DUPLICATE: "Ce flux est déjà suivi (même nom ou même adresse).",
  NOT_FOUND: "Ce flux n'est plus suivi par l'appliance.",
  BLOGWATCHER_MISSING:
    "L'appliance n'a pas la commande blogwatcher installée (image à mettre à jour).",
  BLOGWATCHER_OUTPUT_UNREADABLE:
    "L'appliance n'a pas pu lire la réponse de blogwatcher.",
  BLOGWATCHER_SCAN_FAILED: "L'analyse des flux a échoué côté appliance.",
  BLOGWATCHER_INSTALL_FAILED:
    "L'installation du binaire blogwatcher a échoué côté appliance (réseau ?).",
};

/**
 * Valide une entree de flux sans lui faire confiance. `null` si la forme ne
 * correspond pas au contrat (`name`/`url` textes non vides, `feedUrl`/
 * `lastScanned` texte ou null).
 */
function parseNewsFeed(value: unknown): NewsFeed | null {
  if (typeof value !== "object" || value === null) return null;
  const f = value as Record<string, unknown>;
  if (
    typeof f.name !== "string" ||
    f.name.length === 0 ||
    typeof f.url !== "string" ||
    f.url.length === 0 ||
    (f.feedUrl !== null && typeof f.feedUrl !== "string") ||
    (f.lastScanned !== null && typeof f.lastScanned !== "string")
  ) {
    return null;
  }
  return {
    name: f.name,
    url: f.url,
    feedUrl: f.feedUrl as string | null,
    lastScanned: f.lastScanned as string | null,
  };
}

/** Vrai si `value` est un entier >= 0 (compteurs du contrat). */
function isNonNegativeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0;
}

/**
 * Valide le corps JSON de `GET /api/news/status` sans lui faire confiance.
 *
 * Champs inconnus ignores. `ok !== true`, `available` non booleen, `feeds`
 * non tableau (ou entree non conforme), ou `unreadCount` ni entier positif
 * ni null sont des erreurs de payload.
 *
 * @param value corps, typiquement `await response.json()`.
 */
export function parseNewsStatus(value: unknown):
  | { ok: true; status: NewsStatusResponse }
  | { ok: false; error: string } {
  if (typeof value !== "object" || value === null) {
    return { ok: false, error: "Réponse revue de presse non JSON ou vide." };
  }
  const r = value as Record<string, unknown>;
  const unreadOk = r.unreadCount === null || isNonNegativeInteger(r.unreadCount);
  if (
    r.ok !== true ||
    typeof r.available !== "boolean" ||
    !Array.isArray(r.feeds) ||
    !unreadOk
  ) {
    return { ok: false, error: "Statut de la revue de presse invalide." };
  }
  const feeds: NewsFeed[] = [];
  for (const entry of r.feeds) {
    const feed = parseNewsFeed(entry);
    if (feed === null) {
      return { ok: false, error: "Statut de la revue de presse invalide." };
    }
    feeds.push(feed);
  }
  return {
    ok: true,
    status: {
      ok: true,
      available: r.available,
      feeds,
      unreadCount: r.unreadCount as number | null,
    },
  };
}

/**
 * Valide le corps JSON de `POST /api/news/feeds` en succes : `ok !== true` ou
 * `feed` non conforme sont des erreurs de payload.
 *
 * @param value corps, typiquement `await response.json()`.
 */
export function parseNewsAdd(value: unknown):
  | { ok: true; add: NewsAddResponse }
  | { ok: false; error: string } {
  if (typeof value !== "object" || value === null) {
    return { ok: false, error: "Réponse revue de presse non JSON ou vide." };
  }
  const r = value as Record<string, unknown>;
  if (r.ok !== true) {
    return { ok: false, error: "Réponse d'ajout de flux invalide." };
  }
  const feed = parseNewsFeed(r.feed);
  if (feed === null) {
    return { ok: false, error: "Réponse d'ajout de flux invalide." };
  }
  return { ok: true, add: { ok: true, feed } };
}

/**
 * Valide le corps JSON de `POST /api/news/feeds/remove` : `ok !== true` est
 * une erreur de payload.
 *
 * @param value corps, typiquement `await response.json()`.
 */
export function parseNewsRemove(value: unknown):
  | { ok: true; remove: NewsRemoveResponse }
  | { ok: false; error: string } {
  if (typeof value !== "object" || value === null) {
    return { ok: false, error: "Réponse revue de presse non JSON ou vide." };
  }
  const r = value as Record<string, unknown>;
  if (r.ok !== true) {
    return { ok: false, error: "Réponse de suppression de flux invalide." };
  }
  return { ok: true, remove: { ok: true } };
}

/**
 * Valide le corps JSON de `POST /api/news/scan` en succes : `ok !== true`,
 * `newArticles` non entier positif, ou `feeds` non conforme (source hors
 * `rss`/`html`/`none`, `error` non textuel) sont des erreurs de payload.
 *
 * @param value corps, typiquement `await response.json()`.
 */
export function parseNewsScan(value: unknown):
  | { ok: true; scan: NewsScanResponse }
  | { ok: false; error: string } {
  if (typeof value !== "object" || value === null) {
    return { ok: false, error: "Réponse revue de presse non JSON ou vide." };
  }
  const r = value as Record<string, unknown>;
  if (r.ok !== true || !isNonNegativeInteger(r.newArticles) || !Array.isArray(r.feeds)) {
    return { ok: false, error: "Résultat d'analyse de la revue de presse invalide." };
  }
  const feeds: NewsScanFeed[] = [];
  for (const entry of r.feeds) {
    if (typeof entry !== "object" || entry === null) {
      return { ok: false, error: "Résultat d'analyse de la revue de presse invalide." };
    }
    const f = entry as Record<string, unknown>;
    if (
      typeof f.name !== "string" ||
      f.name.length === 0 ||
      !isNonNegativeInteger(f.newArticles) ||
      !isNonNegativeInteger(f.totalFound) ||
      (f.source !== "rss" && f.source !== "html" && f.source !== "none") ||
      (f.error !== undefined && typeof f.error !== "string")
    ) {
      return { ok: false, error: "Résultat d'analyse de la revue de presse invalide." };
    }
    feeds.push({
      name: f.name,
      newArticles: f.newArticles,
      totalFound: f.totalFound,
      source: f.source,
      ...(typeof f.error === "string" ? { error: f.error } : {}),
    });
  }
  return { ok: true, scan: { ok: true, newArticles: r.newArticles, feeds } };
}

/**
 * Valide le corps JSON de `POST /api/news/setup` en succes : `ok !== true`,
 * `installed`/`available` non booleens, ou `version` texte vide sont des
 * erreurs de payload.
 *
 * @param value corps, typiquement `await response.json()`.
 */
export function parseNewsSetup(value: unknown):
  | { ok: true; setup: NewsSetupResponse }
  | { ok: false; error: string } {
  if (typeof value !== "object" || value === null) {
    return { ok: false, error: "Réponse revue de presse non JSON ou vide." };
  }
  const r = value as Record<string, unknown>;
  if (
    r.ok !== true ||
    typeof r.installed !== "boolean" ||
    typeof r.available !== "boolean" ||
    typeof r.version !== "string" ||
    r.version.length === 0
  ) {
    return { ok: false, error: "Résultat d'installation de blogwatcher invalide." };
  }
  return {
    ok: true,
    setup: {
      ok: true,
      installed: r.installed,
      available: r.available,
      version: r.version,
    },
  };
}

/**
 * Traduit une erreur contractuelle `{ok:false, code, message}` en message
 * utilisateur. Les codes connus ont un libelle dedie ; sinon le message du
 * serveur est utilise (redacte), avec un repli generique.
 */
function describeNewsError(body: unknown, fallback: string): string {
  if (typeof body === "object" && body !== null) {
    const r = body as Record<string, unknown>;
    if (r.ok === false && typeof r.code === "string") {
      const known = NEWS_ERROR_MESSAGES[r.code];
      if (known !== undefined) return known;
      if (typeof r.message === "string") return redactText(r.message);
      return r.code;
    }
  }
  return fallback;
}

/**
 * Lit le statut de la revue de presse de l'appliance : `GET /api/news/status`.
 *
 * @param host IPv4 de l'appliance.
 * @param port port HTTP de l'appliance.
 * @param timeoutMs delai max avant timeout (4000 ms par defaut).
 */
export async function fetchNewsStatus(
  host: string,
  port: number,
  timeoutMs: number = NEWS_TIMEOUT_MS
): Promise<NewsStatusResult> {
  const coordinates = validateHostPort(host, port);
  if (!coordinates.ok) return { ok: false, error: coordinates.errors.join(" ") };

  const controller = new AbortController();
  const abortTimer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(`${buildDesktopUrl(host, port)}/api/news/status`, {
      signal: controller.signal,
      headers: { Accept: "application/json" },
    });
    if (!response.ok) {
      return { ok: false, error: `HTTP ${response.status} sur le statut de la revue de presse.` };
    }
    const parsed = parseNewsStatus(await response.json());
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
 * Ajoute un flux suivi : `POST /api/news/feeds`. `feedUrl` est optionnel
 * (sans lui, le flux est decouvert a la premiere analyse).
 *
 * @param host IPv4 de l'appliance.
 * @param port port HTTP de l'appliance.
 * @param feed `name` + `url` (et `feedUrl` optionnel).
 * @param timeoutMs delai max avant timeout (4000 ms par defaut).
 */
export async function addNewsFeed(
  host: string,
  port: number,
  feed: { name: string; url: string; feedUrl?: string },
  timeoutMs: number = NEWS_TIMEOUT_MS
): Promise<NewsAddResult> {
  const coordinates = validateHostPort(host, port);
  if (!coordinates.ok) return { ok: false, error: coordinates.errors.join(" ") };

  const feedUrl = feed.feedUrl?.trim();
  const body: Record<string, string> = { name: feed.name, url: feed.url };
  if (feedUrl !== undefined && feedUrl.length > 0) body.feedUrl = feedUrl;

  const controller = new AbortController();
  const abortTimer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(`${buildDesktopUrl(host, port)}/api/news/feeds`, {
      method: "POST",
      signal: controller.signal,
      headers: { Accept: "application/json", "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const responseBody: unknown = await response.json().catch(() => null);
    if (response.ok) {
      const parsed = parseNewsAdd(responseBody);
      return parsed.ok ? parsed.add : { ok: false, error: parsed.error };
    }
    return {
      ok: false,
      error: describeNewsError(
        responseBody,
        `HTTP ${response.status} pendant l'ajout du flux.`
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
 * Retire un flux suivi (et ses articles joints) : `POST /api/news/feeds/remove`.
 *
 * @param host IPv4 de l'appliance.
 * @param port port HTTP de l'appliance.
 * @param name nom du flux a retirer.
 * @param timeoutMs delai max avant timeout (4000 ms par defaut).
 */
export async function removeNewsFeed(
  host: string,
  port: number,
  name: string,
  timeoutMs: number = NEWS_TIMEOUT_MS
): Promise<NewsRemoveResult> {
  const coordinates = validateHostPort(host, port);
  if (!coordinates.ok) return { ok: false, error: coordinates.errors.join(" ") };

  const controller = new AbortController();
  const abortTimer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(
      `${buildDesktopUrl(host, port)}/api/news/feeds/remove`,
      {
        method: "POST",
        signal: controller.signal,
        headers: { Accept: "application/json", "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      }
    );
    const body: unknown = await response.json().catch(() => null);
    if (response.ok) {
      const parsed = parseNewsRemove(body);
      return parsed.ok ? parsed.remove : { ok: false, error: parsed.error };
    }
    return {
      ok: false,
      error: describeNewsError(
        body,
        `HTTP ${response.status} pendant la suppression du flux.`
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
 * Lance une analyse de tous les flux suivis : `POST /api/news/scan`.
 *
 * **Route bloquante** : l'appliance interroge le reseau pour chaque flux
 * jusqu'a ~60 s ; l'UI doit afficher « analyse en cours » pendant l'appel.
 *
 * @param host IPv4 de l'appliance.
 * @param port port HTTP de l'appliance.
 * @param timeoutMs delai max (70 s par defaut, adapte a la route bloquante).
 */
export async function scanNews(
  host: string,
  port: number,
  timeoutMs: number = NEWS_SCAN_TIMEOUT_MS
): Promise<NewsScanResult> {
  const coordinates = validateHostPort(host, port);
  if (!coordinates.ok) return { ok: false, error: coordinates.errors.join(" ") };

  const controller = new AbortController();
  const abortTimer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(`${buildDesktopUrl(host, port)}/api/news/scan`, {
      method: "POST",
      signal: controller.signal,
      headers: { Accept: "application/json" },
    });
    const body: unknown = await response.json().catch(() => null);
    if (response.ok) {
      const parsed = parseNewsScan(body);
      return parsed.ok ? parsed.scan : { ok: false, error: parsed.error };
    }
    return {
      ok: false,
      error: describeNewsError(
        body,
        `HTTP ${response.status} pendant l'analyse des flux.`
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
 * Installe la CLI `blogwatcher` sur l'appliance : `POST /api/news/setup`.
 *
 * **Route bloquante** : l'appliance telecharge et verifie la release epinglee
 * (jusqu'a ~60 s) ; l'UI doit afficher « installation en cours » pendant
 * l'appel. Idempotente : un binaire deja fonctionnel n'est pas reinstalle
 * (`installed: false`).
 *
 * @param host IPv4 de l'appliance.
 * @param port port HTTP de l'appliance.
 * @param timeoutMs delai max (70 s par defaut, adapte a la route bloquante).
 */
export async function setupNews(
  host: string,
  port: number,
  timeoutMs: number = NEWS_SETUP_TIMEOUT_MS
): Promise<NewsSetupResult> {
  const coordinates = validateHostPort(host, port);
  if (!coordinates.ok) return { ok: false, error: coordinates.errors.join(" ") };

  const controller = new AbortController();
  const abortTimer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(`${buildDesktopUrl(host, port)}/api/news/setup`, {
      method: "POST",
      signal: controller.signal,
      headers: { Accept: "application/json" },
    });
    const body: unknown = await response.json().catch(() => null);
    if (response.ok) {
      const parsed = parseNewsSetup(body);
      return parsed.ok ? parsed.setup : { ok: false, error: parsed.error };
    }
    return {
      ok: false,
      error: describeNewsError(
        body,
        `HTTP ${response.status} pendant l'installation de blogwatcher.`
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

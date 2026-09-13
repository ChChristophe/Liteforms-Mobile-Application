import {
  buildDesktopUrl,
  parseDesktopHealth,
  parseProvisioningHealth,
} from "./deviceClient";

/**
 * Moteur de decouverte LAN « zéro IP » (protocole 13/09/2026, §Identité).
 *
 * Principe : depuis l'IP locale du mobile (expo-network), determiner le /24
 * courant puis sonder x.x.x.1..254 en parallele sur le port Desktop
 * (43178 par defaut) via `GET /api/health` :
 * - `deviceId` connu => match strict sur `health.deviceId` (appliance
 *   retrouvee apres une transition reseau) ;
 * - sinon => premiere appliance `ok:true` en `networkMode !== "provisioning"`
 *   (premiere association).
 *
 * En mode `acceptProvisioning` (mobile sur le hotspot Electron), la sonde
 * appelle `GET /api/provisioning/health` sur le port de provisioning.
 *
 * Pure/testable : `fetch` est injectable (`fetchImpl`), l'IP locale est un
 * parametre (jamais devine ici). Aucun mot de passe n'eter jamais logge.
 */

/** Port HTTP du Desktop sur le LAN (contrat v1). */
export const DESKTOP_LAN_PORT = 43178;

/** Port par defaut du serveur de provisioning (hotspot, jamais 80). */
export const PROVISIONING_DEFAULT_PORT = 8080;

/** Resultat d'une decouverte, exploitable par l'UI. */
export type DiscoverResult =
  | {
      ok: true;
      host: string;
      port: number;
      deviceId: string | null;
      name: string;
    }
  | { ok: false; error: string };

/** Options de `discoverDesktop` (defauts parcimonieux). */
export type DiscoverOptions = {
  /** Match strict : n'accepter que cette appliance (re-association). */
  deviceId?: string | null;
  /** Port du serveur Desktop, 43178 par defaut. */
  port?: number;
  /** Port du serveur de provisioning, 8080 par defaut. */
  provisionPort?: number;
  /** Timeout par hote, 300 ms par defaut (sonde courte). */
  timeoutPerHostMs?: number;
  /** Degre de parallelisme, 30 par defaut. */
  concurrency?: number;
  /** Fetch injectable (tests) ; defaut : `fetch` global. */
  fetchImpl?: typeof fetch;
  /** Mobile sur le hotspot : sonder `/api/provisioning/health`. */
  acceptProvisioning?: boolean;
};

/**
 * Lit l'IP locale (IPv4) de l'interface WiFi du mobile via expo-network
 * (`getIpAddressAsync`).
 *
 * @returns l'IPv4 affichable, ou `null` si indisponible (mode avion, pas
 *   de reseau, module natif absent) — la decouverte est alors impossible
 *   et l'appelant retombe sur l'ecran besoin-hotspot.
 */
export async function getLocalIpAddress(): Promise<string | null> {
  try {
    // Import dynamique : garde le moteur importable hors runtime Expo
    // (tests, unitaires) ; le module natif est resolu a l'appel.
    const { getIpAddressAsync } = await import("expo-network");
    const address = await getIpAddressAsync();
    return address === "0.0.0.0" || address.length === 0 ? null : address;
  } catch {
    return null;
  }
}

/**
 * Extrait la base du /24 (ex. "192.168.1." depuis "192.168.1.42").
 *
 * @returns la base avec point final, ou `null` si l'IP n'est pas une IPv4
 *   exploitable pour un scan.
 */
export function inferSubnetBase(localIp: string): string | null {
  const match = localIp.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (!match) return null;
  const [, a, b, c, d] = match;
  if ([a, b, c, d].some((s) => Number(s) > 255)) return null;
  return `${a}.${b}.${c}.`;
}

/**
 * Sonde un hote et extrait une identite exploitable.
 *
 * @returns identite, ou `null` si rien ne matche (jamais un reseau mort
 *   confondu avec une appliance).
 */
async function probeHost(
  host: string,
  port: number,
  expectDeviceId: string | null,
  timeoutMs: number,
  doFetch: typeof fetch,
  provisioning: boolean
): Promise<{ deviceId: string | null; name: string; provisioning: boolean } | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await doFetch(
      `${buildDesktopUrl(host, port)}${
        provisioning ? "/api/provisioning/health" : "/api/health"
      }`,
      { signal: controller.signal, headers: { Accept: "application/json" } }
    );
    if (!response.ok) return null;
    const raw: unknown = await response.json();
    if (provisioning) {
      const parsed = parseProvisioningHealth(raw);
      if (!parsed.ok) return null;
      return {
        deviceId: parsed.health.deviceId,
        name: parsed.health.name,
        provisioning: true,
      };
    }
    const parsed = parseDesktopHealth(raw);
    if (!parsed.ok) return null;
    const { networkMode, deviceId, name } = parsed.health;
    if (networkMode === "provisioning") return null;
    return { deviceId: deviceId ?? null, name, provisioning: false };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Decouvre l'appliance Desktop sur le sous-reseau courant (protocole 13/09).
 *
 * Scanne `x.x.x.1..254` (base derivee de {@link localIp}) en parallele
 * borne ({@link DiscoverOptions.concurrency}), timeout court par hote.
 *
 * Match :
 * - `deviceId` fourni : match strict — seule l'appliance dont
 *   `health.deviceId` est identique est retournee (un serveur v1 sans
 *   `deviceId` n'est jamais « retrouve » par prudence) ;
 * - sans `deviceId` : premiere appliance saine hors mode provisioning.
 *
 * @param localIp IP locale du mobile (ex. "192.168.1.42") ; `null` si
 *   indisponible — la decouverte echoue immédiatement avec raison claire.
 * @param options defauts `deviceId: null`, port 43178, timeout 300 ms,
 *   concurrence 30, fetch global.
 */
export async function discoverDesktop(
  localIp: string | null,
  options: DiscoverOptions = {}
): Promise<DiscoverResult> {
  if (localIp === null) {
    return { ok: false, error: "Address IP locale du réseau inconnue." };
  }
  const base = inferSubnetBase(localIp);
  if (base === null) {
    return { ok: false, error: `IP locale non exploitable pour le scan : ${localIp}.` };
  }

  const doFetch = options.fetchImpl ?? fetch;
  const provisioning = options.acceptProvisioning === true;
  const port = provisioning
    ? (options.provisionPort ?? PROVISIONING_DEFAULT_PORT)
    : (options.port ?? DESKTOP_LAN_PORT);
  const timeoutPerHostMs = options.timeoutPerHostMs ?? 300;
  const concurrency = Math.max(1, options.concurrency ?? 30);
  const expectDeviceId = options.deviceId ?? null;

  let matched: Awaited<ReturnType<typeof probeHost>> | null = null;
  let matchedHost: string | null = null;
  const hosts = Array.from({ length: 254 }, (_, i) => `${base}${i + 1}`);

  // Pool de travail borne : 254 sondes, 30 a la fois, jamais bloquant l'UI.
  let cursor = 0;
  async function worker(): Promise<void> {
    while (
      matched === null &&
      cursor < hosts.length
    ) {
      const host = hosts[cursor++];
      const found = await probeHost(
        host,
        port,
        expectDeviceId,
        timeoutPerHostMs,
        doFetch,
        provisioning
      );
      if (found !== null) {
        // Match strict si un deviceId est attendu ; premiere appliance saine
        // sinon (sans deviceId : acceptee pour la premiere association).
        if (expectDeviceId === null || found.deviceId === expectDeviceId) {
          matched = found;
          matchedHost = host;
        }
      }
    }
  }

  await Promise.all(
    // 30 workers partages, croissants avec la concurrence demandee.
    Array.from({ length: Math.min(concurrency, hosts.length) }, () => worker())
  );

  // Snapshot hors closures : TypeScript ne re-analyse pas les assignations
  // asynchrones du pool de workers.
  const winner = matched as Awaited<ReturnType<typeof probeHost>> | null;
  const winnerHost = matchedHost;
  if (winner === null || winnerHost === null) {
    return {
      ok: false,
      error: `Aucune appliance sur ${base}x (scan 1-254).`,
    };
  }
  return {
    ok: true,
    host: winnerHost,
    port,
    deviceId: winner.deviceId,
    name: winner.name,
  };
}

import AsyncStorage from "@react-native-async-storage/async-storage";

/**
 * Persistance des coordonnees Desktop (PLAN.md Phase 6, separe des secrets).
 *
 * - host/port : donnees ordinaires (reseau local non secret) => AsyncStorage ;
 * - deviceId/name : identifiants d'appairage non secrets (protocole
 *   13/09/2026 : le deviceId sert au re-match apres transition WiFi) ;
 * - aucun token de pairing, aucun mot de passe WiFi : la route de
 *   provisioning n'est jamais persistee.
 *
 * En cas de corruption (port non numerique, lecture failed), la donnee est
 * consideree absente : le store applicatif retombe sur "non connecte" sans
 * crash.
 */

const STORAGE_PREFIX = "liteforms.connection.";
const KEY_HOST = `${STORAGE_PREFIX}host`;
const KEY_PORT = `${STORAGE_PREFIX}port`;
const KEY_DEVICE_ID = `${STORAGE_PREFIX}deviceId`;
const KEY_NAME = `${STORAGE_PREFIX}name`;

/** Session apprise complete (host/port + identite appliance 13/09). */
export type StoredConnectionSession = {
  host: string;
  port: number;
  deviceId?: string;
  name?: string;
};

/** Coordonnees du Desktop, ou `null` si aucune session configuree. */
export type StoredConnection = StoredConnectionSession | null;

/**
 * Lit les coordonnees persistees du Desktop.
 *
 * @returns session complete si host/port sont presents et coherents ;
 *   `null` si absents, corrompus ou illisibles (quota, platform edge).
 */
export async function loadConnectionInfo(): Promise<StoredConnection> {
  try {
    const host = await AsyncStorage.getItem(KEY_HOST);
    const portRaw = await AsyncStorage.getItem(KEY_PORT);
    if (host === null || portRaw === null) return null;
    const port = Number.parseInt(portRaw, 10);
    if (!Number.isInteger(port) || port < 1 || port > 65535) return null;
    const deviceId = await AsyncStorage.getItem(KEY_DEVICE_ID);
    const name = await AsyncStorage.getItem(KEY_NAME);
    return {
      host,
      port,
      ...(deviceId !== null && deviceId.length > 0 ? { deviceId } : {}),
      ...(name !== null && name.length > 0 ? { name } : {}),
    };
  } catch {
    return null;
  }
}

/**
 * Ecrit les coordonnees du Desktop (ecrasement de la session precedente).
 *
 * @param host IPv4 du Desktop.
 * @param port port HTTP du Desktop.
 * @param extra identifiant appris lors de l'onboarding (`deviceId`), optionnel.
 * @throws si AsyncStorage echoue (quota) — l'appelant decide (bug visible).
 */
export async function saveConnectionInfo(
  host: string,
  port: number,
  extra?: { deviceId?: string | null; name?: string | null }
): Promise<void> {
  await AsyncStorage.setItem(KEY_HOST, host);
  await AsyncStorage.setItem(KEY_PORT, String(port));
  await AsyncStorage.setItem(
    KEY_DEVICE_ID,
    extra?.deviceId ?? ""
  );
  await AsyncStorage.setItem(KEY_NAME, extra?.name ?? "");
}

/**
 * Efface les coordonnees du Desktop (hors mot de passe WiFi, jamais persiste).
 * Idempotent.
 */
export async function clearConnectionInfo(): Promise<void> {
  await AsyncStorage.multiRemove([
    KEY_HOST,
    KEY_PORT,
    KEY_DEVICE_ID,
    KEY_NAME,
  ]);
}

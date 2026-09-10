import AsyncStorage from "@react-native-async-storage/async-storage";

/**
 * Persistance des coordonnees Desktop (PLAN.md Phase 6, separe des secrets).
 *
 * - host/port : donnees ordinaires (reseau local non secret) => AsyncStorage ;
 * - aucun token de pairing : le produit utilise le hotspot de provisioning,
 *   pas une saisie de token sur l'Electron.
 *
 * En cas de corruption (port non numerique, lecture failed), la donnee est
 * consideree absente : le store applicatif retombe sur "non connecte" sans
 * crash.
 */

const STORAGE_PREFIX = "liteforms.connection.";
const HOST_KEY = `${STORAGE_PREFIX}host`;
const PORT_KEY = `${STORAGE_PREFIX}port`;

/** Coordonnees du Desktop, ou `null` si aucune session configuree. */
export type StoredConnection = { host: string; port: number } | null;

/**
 * Lit les coordonnees persistees du Desktop.
 *
 * @returns {host, port} si les deux champs sont presents et coherents ;
 *   `null` si absents, corrompus ou illisibles (quota, platform edge).
 */
export async function loadConnectionInfo(): Promise<StoredConnection> {
  try {
    const host = await AsyncStorage.getItem(HOST_KEY);
    const portRaw = await AsyncStorage.getItem(PORT_KEY);
    if (host === null || portRaw === null) return null;
    const port = Number.parseInt(portRaw, 10);
    if (!Number.isInteger(port) || port < 1 || port > 65535) return null;
    return { host, port };
  } catch {
    return null;
  }
}

/**
 * Ecrit les coordonnees du Desktop (ecrasement du couple precedent).
 *
 * @throws si AsyncStorage echoue (quota) — l'appelant decide (bug visible).
 */
export async function saveConnectionInfo(
  host: string,
  port: number
): Promise<void> {
  await AsyncStorage.setItem(HOST_KEY, host);
  await AsyncStorage.setItem(PORT_KEY, String(port));
}

/**
 * Efface les coordonnees du Desktop. Idempotent.
 */
export async function clearConnectionInfo(): Promise<void> {
  await AsyncStorage.removeItem(HOST_KEY);
  await AsyncStorage.removeItem(PORT_KEY);
}

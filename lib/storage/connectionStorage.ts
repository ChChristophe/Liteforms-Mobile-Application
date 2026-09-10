import AsyncStorage from "@react-native-async-storage/async-storage";
import * as SecureStore from "expo-secure-store";

/**
 * Persistance des coordonnees Desktop (PLAN.md Phase 6, separe des secrets).
 *
 * - host/port : donnees ordinaires (reseau local non secret) => AsyncStorage ;
 * - token de pairing : SECRET => SecureStore uniquement, jamais AsyncStorage,
 *   jamais log (D1 / regles de stockage PLAN.md 5.2-8).
 *
 * En cas de corruption (port non numerique, lecture failed), la donnee est
 * consideree absente : le store applicatif retombe sur "non connecte" sans
 * crash.
 */

const STORAGE_PREFIX = "liteforms.connection.";
const HOST_KEY = `${STORAGE_PREFIX}host`;
const PORT_KEY = `${STORAGE_PREFIX}port`;
const PAIRING_TOKEN_KEY = `${STORAGE_PREFIX}pairingToken`;

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

/**
 * Lit le token de pairing en SecureStore.
 *
 * @returns la valeur brute, ou `null` si absente/illisible. La valeur ne
 *   doit JAMAIS etre loggee ni affichee (D1) : consommateur = client reseau.
 */
export async function loadPairingToken(): Promise<string | null> {
  try {
    return await SecureStore.getItemAsync(PAIRING_TOKEN_KEY);
  } catch {
    return null;
  }
}

/**
 * Ecrit le token de pairing en SecureStore (ecrasement du precedent).
 *
 * @throws si SecureStore echoue (device sans keystore, quota) — l'appelant
 *   affiche l'erreur, on ne persiste pas un demi-pairing.
 */
export async function savePairingToken(token: string): Promise<void> {
  await SecureStore.setItemAsync(PAIRING_TOKEN_KEY, token);
}

/** Efface le token de pairing. Idempotent. */
export async function clearPairingToken(): Promise<void> {
  await SecureStore.deleteItemAsync(PAIRING_TOKEN_KEY);
}
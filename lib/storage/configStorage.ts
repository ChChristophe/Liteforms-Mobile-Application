import AsyncStorage from "@react-native-async-storage/async-storage";
import type { DeviceConfig } from "../../types/config";
import { parseDeviceConfig } from "../config/serialization";
import { validateDeviceConfig } from "../config/validation";

/**
 * Persistance locale de la configuration ordinaire (PLAN.md section 3.3).
 *
 * - cle unique : `liteforms.deviceConfig` ;
 * - format : JSON serialise de `DeviceConfig`, versionne par `configVersion` ;
 * - migration : une version incompatible ou une donnee corrompue est
 *   consideree absente (`null`) ; l'appelant retombe sur les defauts. La
 *   donnee source n'est JAMAIS effacee automatiquement (diagnostic possible) ;
 * - secrets : cette couche ne doit jamais recevoir de cle API ni de token de
 *   pairing (D1). Aucune autre cle ne doit etre ajoutee ici sans decision.
 *
 * Contrainte de plateforme : AsyncStorage n'est PAS chiffre. Ne jamais y
 * stocker un binaire VRM ni un secret.
 */

/** Cle AsyncStorage de la configuration ordinaire. */
export const CONFIG_STORAGE_KEY = "liteforms.deviceConfig";

/**
 * Charge la configuration persistee et la valide.
 *
 * @returns configuration validee, ou `null` si absente, corrompue ou d'une
 *   version incompatible. Les erreurs AsyncStorage sont loggees en `__DEV__`
 *   et neutralisees pour ne pas bloquer le demarrage.
 */
export async function loadStoredDeviceConfig(): Promise<DeviceConfig | null> {
  try {
    const raw = await AsyncStorage.getItem(CONFIG_STORAGE_KEY);
    if (raw === null) return null;
    return parseDeviceConfig(raw);
  } catch (error) {
    if (__DEV__) {
      console.warn("[configStorage] failed to load config", error);
    }
    return null;
  }
}

/**
 * Persiste la configuration ordinaire.
 *
 * @param config configuration validee ; rien n'est ecrit si le parametre
 *   n'est pas conforme au contrat (defense en profondeur).
 * @throwspropagate les erreurs AsyncStorage : un echec d'ecriture doit etre
 *   visible par l'appelant (statut de synchronisation), pas silencieux.
 */
export async function saveStoredDeviceConfig(config: DeviceConfig): Promise<void> {
  const result = validateDeviceConfig(config);
  if (!result.ok) {
    throw new Error(`refusing to persist invalid config: ${result.errors.join("; ")}`);
  }
  // Serialisation directe : l'etat d'edition local peut legitiment contenir
  // la sentinelle "none" (validée ci-dessus, mais non envoyable). On n'utilise
  // donc PAS serializeDeviceConfig ici, dont la garde refuse "none" (wire-only).
  await AsyncStorage.setItem(CONFIG_STORAGE_KEY, JSON.stringify(config));
}

/**
 * Supprime la configuration persistee (reset usager ou test).
 * @throwspropagate les erreurs AsyncStorage a l'appelant.
 */
export async function clearStoredDeviceConfig(): Promise<void> {
  await AsyncStorage.removeItem(CONFIG_STORAGE_KEY);
}

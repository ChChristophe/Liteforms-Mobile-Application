import { DEVICE_CONFIG_VERSION, type DeviceConfig } from "../../types/config";
import { validateDeviceConfig } from "./validation";

/**
 * Serialise une configuration pour envoi au Desktop ou stockage local.
 *
 * Le payload ne contient QUE les champs du contrat (les champs inconnus de
 * l'objet source sont perdus volontairement) et aucune donnee secrete : le
 * type `DeviceConfig` n'en porte pas (D1).
 *
 * @param config configuration complete, suposee validee en amont.
 * @returns representation JSON stable, pret pour `POST /api/device-config`.
 */
export function serializeDeviceConfig(config: DeviceConfig): string {
  return JSON.stringify(config);
}

/**
 * Deserialise une configuration depuis une chaine JSON (stockage local,
 * export/import, reponse Desktop).
 *
 * Comportement de compatibilite (PLAN.md 5.3) :
 * - une version differente de `DEVICE_CONFIG_VERSION` est refusee (retour
 *   `null`) ; il n'existe pas encore d'ancienne version a migrer : la
 *   migration propre est un reset vers les defauts par l'appelant ;
 * - les champs inconnus sont ignores par la validation ;
 * - une chaine corrompue ou invalide retourne `null` sans lever.
 *
 * @param raw chaine JSON a parser.
 * @returns configuration validee, ou `null` si non conforme.
 */
export function parseDeviceConfig(raw: string): DeviceConfig | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (
    typeof parsed !== "object" ||
    parsed === null ||
    (parsed as Record<string, unknown>).configVersion !== DEVICE_CONFIG_VERSION
  ) {
    // Version incompatible ou absente : refusee proprement, jamais corrigee
    // silencieusement — la version est une frontiere de contrat.
    return null;
  }
  const result = validateDeviceConfig(parsed);
  return result.ok ? result.config : null;
}

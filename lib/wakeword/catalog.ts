/**
 * Catalogue statique des wake words (protocole `DEVICE_API.md`
 * §`POST /api/device-config`, bloc `wakeWord`, 18/09/2026).
 *
 * Le Mobile n'importe jamais `liteforms-web` ni `liteforms-electron` : cet
 * inventaire est le pendant local de `WAKE_WORD_PHRASES` de l'appliance. Il
 * sert uniquement a l'affichage ; la detection reste 100 % locale a
 * l'appliance (aucun appel API, aucun audio transporte).
 */
import { WAKE_WORD_MODEL_IDS, type WakeWordModel } from "../../types/config";

/** Libelles/phrases affiches, alignes sur l'appliance. */
export const WAKE_WORD_LABELS: Record<WakeWordModel, string> = {
  hey_jarvis: "Hey Jarvis",
  alexa: "Alexa",
  hey_mycroft: "Hey Mycroft",
  hey_rhasspy: "Hey Rhasspy",
};

/** Entree du catalogue wake word. */
export type WakeWordCatalogEntry = {
  /** Identifiant de contrat (`wakeWord.model`). */
  id: WakeWordModel;
  /** Phrase prononcee, aussi libelle affiche. */
  phrase: string;
};

/** Modeles proposes, dans l'ordre de `WAKE_WORD_MODEL_IDS`. */
export const WAKE_WORD_MODELS: readonly WakeWordCatalogEntry[] =
  WAKE_WORD_MODEL_IDS.map((id) => ({ id, phrase: WAKE_WORD_LABELS[id] }));

/** Libelle affichable d'un choix de wake word (« Aucun » si `null`). */
export function wakeWordLabel(model: WakeWordModel | null): string {
  return model === null ? "Aucun" : WAKE_WORD_LABELS[model];
}

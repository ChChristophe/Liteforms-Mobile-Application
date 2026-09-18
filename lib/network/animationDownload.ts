import * as FileSystem from "expo-file-system/legacy";
import { buildDesktopUrl, validateHostPort } from "./deviceClient";
import { redactText } from "./networkErrors";
import { findAnimationEntry } from "../animations/catalog";
import {
  animationFileUri,
  animationPartUri,
  ensureAnimationCacheDir,
  saveAnimationCacheEntry,
} from "../storage/animationCache";

/**
 * Telechargement d'une animation VRMA depuis l'appliance (apercu local).
 *
 * Route : `GET http://<appliance>:43178/animations/<fileName>.vrma` (asset
 * statique `public/animations/`, aucun endpoint nouveau, aucun changement de
 * contrat).
 *
 * Choix d'API (SDK 57) : `createDownloadResumable` du sous-chemin
 * `expo-file-system/legacy` — progression native et annulation ; le nom de
 * fichier est valide LOCALEMENT contre le CATALOGUE avant toute URL
 * (anti path traversal : un nom hors catalogue ne part jamais sur le reseau).
 *
 * Ecriture atomique : le binaire arrive en `.part`, renomme sur le nom final
 * SEULEMENT s'il est complet — une animation interrompue n'est jamais lue par
 * le preview. Le repertoire de cache dedie est cree avant le telechargement.
 */

/** Progression : fraction (0..1) du telechargement, `null` si total inconnu. */
export type AnimationDownloadProgress = number | null;

/** Resultat d'un telechargement d'animation, exploitable par l'UI. */
export type AnimationDownloadResult =
  | { ok: true; fileUri: string; sizeBytes: number }
  | { ok: false; error: string };

/**
 * Demarre le telechargement d'une animation vers le cache local.
 *
 * `onProgress` est THROTLE ICI (palier de 10 %) : au plus 10 mises a jour
 * d'etat par fichier, jamais un setState par event FileSystem.
 *
 * @param host IPv4 de l'appliance.
 * @param port port HTTP de l'appliance.
 * @param fileName nom du catalogue (la fonction refuse tout autre nom).
 * @param onProgress callback de progression throtle (null si total inconnu).
 * @returns un resultat redige : jamais de rejet, jamais de crash.
 */
export function startAnimationDownload(
  host: string,
  port: number,
  fileName: string,
  onProgress?: (fraction: AnimationDownloadProgress) => void
): Promise<AnimationDownloadResult> {
  const coordinates = validateHostPort(host, port);
  if (!coordinates.ok) {
    return Promise.resolve({ ok: false, error: coordinates.errors.join(" ") });
  }
  // Garde path traversal : le nom doit appartenir au catalogue.
  if (findAnimationEntry(fileName) === undefined) {
    return Promise.resolve({
      ok: false,
      error: "Animation inconnue du catalogue.",
    });
  }
  const fileUri = animationFileUri(fileName);
  const partUri = animationPartUri(fileName);
  if (fileUri === null || partUri === null) {
    return Promise.resolve({
      ok: false,
      error: "Stockage local indisponible pour les animations.",
    });
  }

  const url = `${buildDesktopUrl(host, port)}/animations/${encodeURIComponent(fileName)}`;

  // Progression throtlee : un callback UI par palier de 10 % seulement.
  let lastStep = -1;
  let lastWritten = 0;
  let unknownReported = false;
  const throttled = (data: {
    totalBytesWritten: number;
    totalBytesExpectedToWrite: number;
  }): void => {
    lastWritten = data.totalBytesWritten;
    if (onProgress === undefined) return;
    if (data.totalBytesExpectedToWrite <= 0) {
      if (unknownReported) return;
      unknownReported = true;
      onProgress(null);
      return;
    }
    const fraction = data.totalBytesWritten / data.totalBytesExpectedToWrite;
    const step = Math.floor(fraction * 10);
    if (step > Math.max(lastStep, 0)) {
      lastStep = step;
      onProgress(Math.min(step / 10, 1));
    }
  };

  const resumable = FileSystem.createDownloadResumable(
    url,
    partUri,
    {},
    throttled
  );

  return (async (): Promise<AnimationDownloadResult> => {
    try {
      // Le repertoire de cache doit exister avant d'ecrire le `.part`.
      if (!(await ensureAnimationCacheDir())) {
        return {
          ok: false,
          error: "Stockage local indisponible pour les animations.",
        };
      }
      // Purge d'un `.part` oublie par une session precedente.
      await FileSystem.deleteAsync(partUri, { idempotent: true });
      const result = await resumable.downloadAsync();
      if (result === undefined) {
        await FileSystem.deleteAsync(partUri, { idempotent: true });
        return { ok: false, error: "Téléchargement interrompu." };
      }
      if (result.status < 200 || result.status >= 300) {
        await FileSystem.deleteAsync(partUri, { idempotent: true });
        return {
          ok: false,
          error: `HTTP ${result.status} pendant le téléchargement de l'animation.`,
        };
      }
      // Renommage atomique `.part` -> final : le preview ne voit que complet.
      await FileSystem.moveAsync({ from: partUri, to: fileUri });
      await saveAnimationCacheEntry(fileName, lastWritten);
      return { ok: true, fileUri, sizeBytes: lastWritten };
    } catch (error) {
      // Erreur reseau/ecriture : le `.part` est abandonne, resultat redige.
      await FileSystem.deleteAsync(partUri, { idempotent: true }).catch(
        () => undefined
      );
      const message =
        error instanceof Error
          ? error.message
          : "Erreur inconnue pendant le téléchargement.";
      return { ok: false, error: redactText(message) };
    }
  })();
}

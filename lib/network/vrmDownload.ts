import * as FileSystem from "expo-file-system/legacy";
import { buildDesktopUrl, validateHostPort } from "./deviceClient";
import { redactText } from "./networkErrors";
import {
  residentVrmFileUri,
  residentVrmPartUri,
} from "../storage/residentVrm";

/**
 * Telechargement du binaire VRM Desktop -> telephone (decision D2,
 * contrat `GET /api/device/vrms/file?name=<fileName>`).
 *
 * Choix d'API (SDK 57) : `createDownloadResumable` du sous-chemin
 * `expo-file-system/legacy` — `downloadAsync` n'expose PAS de callback de
 * progression, la resumable oui, plus une annulation propre
 * (`cancelAsync` pour le demontage de l'ecran). Les coordonnees LAN v1 sont
 * de confiance (protocole) mais le `fileName` est valide ICI, localement,
 * avant toute URL : un nom hors contrat ne part jamais vers le reseau
 * (anti path traversal, miroir de la restriction serveur
 * `^[A-Za-z0-9][A-Za-z0-9._-]*\.vrm$`).
 *
 * Ecriture atomique : tout telechargement se termine `.part`, renomme
 * sur le fichier resident SEULEMENT si le fichier est complet — un
 * interrompu n'est jamais visible du preview (garde D2 : pas de purge
 * pendant un render en cours, le remplacement est un renommage).
 */

/** Motif du `name` servi par `GET /api/device/vrms/file` (protocole). */
export const VRM_FILE_NAME_PATTERN =
  /^[A-Za-z0-9][A-Za-z0-9._-]*\.vrm$/;

/** Progression : fraction (0..1) du telechargement, `null` si total inconnu. */
export type VrmDownloadProgress = number | null;

/**
 * Resultat d'un telechargement VRM, exploitable par l'UI.
 * `md5` vient du calcul natif expo-file-system (`md5: true`) — alimente
 * `modelRef.hash` (contrat D2/D4).
 */
export type VrmDownloadResult =
  | { ok: true; fileUri: string; sizeBytes: number; md5: string | null }
  | { ok: false; error: string; cancelled: boolean };

/** Tache en cours : promesse du resultat et annulation propre (.part purge). */
export type VrmDownloadTask = {
  promise: Promise<VrmDownloadResult>;
  cancel: () => Promise<void>;
};

/**
 * Demarre le telechargement d'un VRM depuis le Desktop vers le resident
 * local du telephone. Le callback `onProgress` est THROTLE ICI (palier de
 * 10 %) : au plus 10 mises a jour d'etat par fichier (garde : jamais un
 * setState par event FileSystem — le throttle est ICI, pas dans l'UI).
 *
 * @param host IPv4 du Desktop.
 * @param port port HTTP du Desktop.
 * @param fileName nom du fichier telecharge (valide localement avant URL).
 * @param onProgress callback de progression throtle (null si Content-Length absent).
 */
export function startVrmDownload(
  host: string,
  port: number,
  fileName: string,
  onProgress?: (fraction: number | null) => void
): VrmDownloadTask {
  const failure = (error: string): VrmDownloadTask => ({
    promise: Promise.resolve({ ok: false, error, cancelled: false }),
    // Rien en cours : annulation de courtoisie effectuee (idempotent).
    cancel: () => Promise.resolve(),
  });

  const coordinates = validateHostPort(host, port);
  if (!coordinates.ok) {
    return failure(coordinates.errors.join(" "));
  }
  // Garde path traversal : le nom est valide avant de former l'URL.
  if (!VRM_FILE_NAME_PATTERN.test(fileName)) {
    return failure(
      "Nom de fichier VRM invalide (attendu : `nom.vrm`, caracteres alphanumeriques, point ou tiret)."
    );
  }
  const fileUri = residentVrmFileUri();
  const partUri = residentVrmPartUri();
  if (fileUri === null || partUri === null) {
    return failure("Stockage local indisponible pour le VRM resident.");
  }

  const url = `${buildDesktopUrl(host, port)}/api/device/vrms/file?name=${encodeURIComponent(fileName)}`;

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
      // Total inconnu (Content-Length absent) : une seule notification null,
      // pas une par event (meme garde anti re-render en rafale).
      if (unknownReported) return;
      unknownReported = true;
      onProgress(null);
      return;
    }
    const fraction = data.totalBytesWritten / data.totalBytesExpectedToWrite;
    const step = Math.floor(fraction * 10);
    // Paliers 1..10 : le debut (0) reste sur l'etat indetermine, le total
    // d'events reste <= 10 (+ le 100 % qui clot).
    if (step > Math.max(lastStep, 0)) {
      lastStep = step;
      onProgress(Math.min(step / 10, 1));
    }
  };

  const resumable = FileSystem.createDownloadResumable(
    url,
    partUri,
    { md5: true },
    throttled
  );

  // Purge d'un `.part` oublie par une session precedente : le telechargement
  // repart de zero, un seul resident a la fois (D2).
  const promise: Promise<VrmDownloadResult> = (async () => {
    try {
      await FileSystem.deleteAsync(partUri, { idempotent: true });
      const result = await resumable.downloadAsync();
      if (result === undefined) {
        // Annulation volontaire (demontage de l'ecran) : non affichable.
        return { ok: false, error: "Telechargement annulé.", cancelled: true };
      }
      if (result.status < 200 || result.status >= 300) {
        await FileSystem.deleteAsync(partUri, { idempotent: true });
        return {
          ok: false,
          error: `HTTP ${result.status} pendant le téléchargement du VRM.`,
          cancelled: false,
        };
      }
      // Remote-renommage atomique `.part` → resident final. Silencieux
      // pour le preview : le fichier n'apparait qu'une fois complet.
      await FileSystem.moveAsync({ from: partUri, to: fileUri });
      return {
        ok: true,
        fileUri,
        sizeBytes: lastWritten,
        md5: typeof result.md5 === "string" ? result.md5 : null,
      };
    } catch (error) {
      // Erreur reseau ou ecriture : le .part est abandonne, jamais propage
      // au preview (resultat redige, pas de crash — pattern deviceClient).
      await FileSystem.deleteAsync(partUri, { idempotent: true }).catch(
        () => undefined
      );
      const message =
        error instanceof Error
          ? error.message
          : "Erreur inconnue pendant le téléchargement.";
      return {
        ok: false,
        error: redactText(message),
        cancelled: false,
      };
    }
  })();

  return {
    promise,
    cancel: async () => {
      await resumable.cancelAsync();
      try {
        await FileSystem.deleteAsync(partUri, { idempotent: true });
      } catch {
        // Le cancelAsync peut deja avoir purge le fichier : non bloquant.
      }
    },
  };
}

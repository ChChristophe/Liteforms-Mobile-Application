/**
 * Catalogue statique des animations VRMA de l'avatar.
 *
 * Miroir local FIDELE de `ANIMATION_OPTIONS` de `liteforms-web` /
 * `liteforms-electron` (`lib/avatar/animationOptions.ts`) : le Mobile
 * n'importe jamais ces repos, ce fichier est le pendant local de
 * l'inventaire Desktop. Aucun appel reseau pour LISTER : l'inventaire est
 * fige ici ; seul le binaire d'une animation non embarquee est telecharge a
 * la demande depuis `http://<appliance>:43178/animations/<fileName>.vrma`.
 *
 * L'entree « Idle (default) » pointe le bundle deja embarque
 * (`assets/animations/idle_loop.vrma`) : lecture hors ligne, jamais
 * telechargee. Les autres entrees sont telechargeables et mises en cache.
 */

/** Entree du catalogue d'animations. */
export type AnimationCatalogEntry = {
  /** Libelle affiche (identique a `ANIMATION_OPTIONS`). */
  label: string;
  /** Nom de fichier VRMA (cle de cache et segment d'URL). */
  fileName: string;
  /** URL relative servie en statique par l'appliance. */
  url: string;
  /**
   * `true` si l'animation est embarquee dans l'application (bundle) : elle se
   * lit localement sans reseau et n'est jamais telechargee.
   */
  bundled: boolean;
};

/** Nom du VRMA embarqué (idle de demarrage du preview). */
export const BUNDLED_ANIMATION_FILE_NAME = "idle_loop.vrma";

/**
 * Motif du nom de fichier VRMA accepte (garde anti path traversal) :
 * alphanumerique initial, puis alphanumeriques, point, underscore ou tiret,
 * extension `.vrma` obligatoire.
 */
export const ANIMATION_FILE_NAME_PATTERN =
  /^[A-Za-z0-9][A-Za-z0-9._-]*\.vrma$/;

/**
 * Catalogue des animations, dans l'ordre STRICT de `ANIMATION_OPTIONS`.
 *
 * `idle_loop.vrma` est le seul `bundled` ; les autres fichiers sont servis
 * par l'appliance en statique et telecharges a la demande.
 */
export const ANIMATION_CATALOG: readonly AnimationCatalogEntry[] = [
  {
    label: "Idle (default)",
    fileName: "idle_loop.vrma",
    url: "/animations/idle_loop.vrma",
    bundled: true,
  },
  { label: "Greeting", fileName: "Greeting.vrma", url: "/animations/Greeting.vrma", bundled: false },
  { label: "Goodbye", fileName: "Goodbye.vrma", url: "/animations/Goodbye.vrma", bundled: false },
  { label: "Clapping", fileName: "Clapping.vrma", url: "/animations/Clapping.vrma", bundled: false },
  { label: "Angry", fileName: "Angry.vrma", url: "/animations/Angry.vrma", bundled: false },
  { label: "Blush", fileName: "Blush.vrma", url: "/animations/Blush.vrma", bundled: false },
  { label: "Jump", fileName: "Jump.vrma", url: "/animations/Jump.vrma", bundled: false },
  { label: "Look Around", fileName: "LookAround.vrma", url: "/animations/LookAround.vrma", bundled: false },
  { label: "Model Pose", fileName: "ModelPose.vrma", url: "/animations/ModelPose.vrma", bundled: false },
  { label: "Peace Sign", fileName: "PeaceSign.vrma", url: "/animations/PeaceSign.vrma", bundled: false },
  { label: "Relax", fileName: "Relax.vrma", url: "/animations/Relax.vrma", bundled: false },
  { label: "Sad", fileName: "Sad.vrma", url: "/animations/Sad.vrma", bundled: false },
  { label: "Shoot", fileName: "Shoot.vrma", url: "/animations/Shoot.vrma", bundled: false },
  { label: "Show Full Body", fileName: "ShowFullBody.vrma", url: "/animations/ShowFullBody.vrma", bundled: false },
  { label: "Sleepy", fileName: "Sleepy.vrma", url: "/animations/Sleepy.vrma", bundled: false },
  { label: "Spin", fileName: "Spin.vrma", url: "/animations/Spin.vrma", bundled: false },
  { label: "Squat", fileName: "Squat.vrma", url: "/animations/Squat.vrma", bundled: false },
  { label: "Surprised", fileName: "Surprised.vrma", url: "/animations/Surprised.vrma", bundled: false },
  { label: "Thinking", fileName: "Thinking.vrma", url: "/animations/Thinking.vrma", bundled: false },
  { label: "Walk", fileName: "walk.vrma", url: "/animations/walk.vrma", bundled: false },
];

/**
 * Retrouve une entree par nom de fichier.
 *
 * @param fileName nom de fichier VRMA (issu du catalogue uniquement).
 * @returns l'entree, ou `undefined` si le nom n'appartient pas au catalogue
 *   (garde anti path traversal : un nom hors catalogue ne forme jamais
 *   d'URL de telechargement).
 */
export function findAnimationEntry(
  fileName: string
): AnimationCatalogEntry | undefined {
  return ANIMATION_CATALOG.find((entry) => entry.fileName === fileName);
}

/**
 * Retrouve une entree par URL relative.
 *
 * @param url URL relative servie par l'appliance (ex.
 *   `/animations/Greeting.vrma`).
 * @returns l'entree, ou `undefined` si l'URL n'appartient pas au catalogue.
 */
export function findAnimationByUrl(
  url: string
): AnimationCatalogEntry | undefined {
  return ANIMATION_CATALOG.find((entry) => entry.url === url);
}

/**
 * Indique si un nom de fichier est une animation connue du catalogue.
 * @returns `true` si l'entree existe ET respecte le motif VRMA.
 */
export function isKnownAnimationFileName(fileName: string): boolean {
  return (
    ANIMATION_FILE_NAME_PATTERN.test(fileName) &&
    findAnimationEntry(fileName) !== undefined
  );
}

/**
 * URL d'animation de cue wake word a persister pour une selection du preview
 * d'avatar.
 *
 * L'idle est la pose de base, jamais une confirmation de detection : le
 * selectionner reste un aperçu LOCAL, on ne touche pas a la cue (`null`). Les
 * autres entrees deviennent l'animation jouee a la detection du wake word.
 *
 * @returns l'URL de contrat a ecrire dans `wakeWord.cue.animationUrl`, ou
 *   `null` quand il ne faut rien persister.
 */
export function wakeWordCueAnimationUrlFor(
  entry: AnimationCatalogEntry
): string | null {
  return entry.fileName === BUNDLED_ANIMATION_FILE_NAME ? null : entry.url;
}

import AsyncStorage from "@react-native-async-storage/async-storage";
import * as FileSystem from "expo-file-system/legacy";
import { isKnownAnimationFileName } from "../animations/catalog";
import { decodeBase64 } from "./base64";

/**
 * Cache local des animations VRMA telechargees depuis l'appliance (aperçu
 * local, pas de changement de contrat).
 *
 * Regles de la couche :
 * - PLUSIEURS animations peuvent cohabiter (contrairement au VRM resident) :
 *   un repertoire dedie `<documentDirectory>/liteforms-animations/` et une
 *   map `fileName -> metadata` en AsyncStorage. Le BINAIRE ne vit jamais en
 *   AsyncStorage, seulement la metadata (taille + date) ;
 * - l'URI du fichier est derivee du `fileName` (valide contre le catalogue) :
 *   aucune URL ni chemin arbitraire n'est jamais ecrit ;
 * - lecture par `readAsStringAsync` Base64 + `decodeBase64` (JAMAIS
 *   `fetch(file://)`, lecon 15/09 sur Android) ;
 * - une metadata orpheline (fichier purge par l'OS) est traitee comme un
 *   cache-miss, jamais comme une erreur fatale.
 */

/** Cle AsyncStorage de la map de metadata du cache d'animations. */
export const ANIMATION_CACHE_META_KEY = "liteforms.animationCache";

/** Sous-repertoire du document directory dedie aux animations. */
const ANIMATION_CACHE_DIR_NAME = "liteforms-animations";

/** Metadata d'une animation telechargee. */
export type AnimationCacheEntry = {
  /** Taille du binaire en octets. */
  sizeBytes: number;
  /** Horodatage ISO du telechargement (diagnostic). */
  cachedAt: string;
};

/** Map `fileName -> metadata` du cache. */
export type AnimationCacheMeta = Record<string, AnimationCacheEntry>;

/**
 * URI du repertoire de cache, ou `null` si le document directory est
 * indisponible (le cache est alors desactive, le preview reste fonctionnel
 * avec le bundle).
 */
export function animationCacheDirUri(): string | null {
  return FileSystem.documentDirectory === null
    ? null
    : `${FileSystem.documentDirectory}${ANIMATION_CACHE_DIR_NAME}/`;
}

/**
 * URI du fichier final d'une animation en cache.
 * @param fileName nom du catalogue (valide en amont).
 * @returns URI, ou `null` si le stockage est indisponible.
 */
export function animationFileUri(fileName: string): string | null {
  const dir = animationCacheDirUri();
  return dir === null ? null : `${dir}${fileName}`;
}

/**
 * URI du fichier temporaire (`.part`) d'un telechargement d'animation.
 * Ecriture atomique : le fichier final n'apparait qu'une fois complet.
 */
export function animationPartUri(fileName: string): string | null {
  const file = animationFileUri(fileName);
  return file === null ? null : `${file}.part`;
}

/**
 * Cree le repertoire de cache s'il n'existe pas (idempotent).
 *
 * A appeler AVANT tout `createDownloadResumable` vers un `.part` du
 * repertoire (expo-file-system n'y cree pas les directories intermediaires).
 *
 * @returns `true` si le repertoire est utilisable, `false` sinon (stockage
 *   indisponible : l'appelant affiche l'erreur, jamais un crash).
 */
export async function ensureAnimationCacheDir(): Promise<boolean> {
  const dir = animationCacheDirUri();
  if (dir === null) return false;
  try {
    // `makeDirectoryAsync` echoue si le repertoire existe deja : on ignore.
    await FileSystem.makeDirectoryAsync(dir, { intermediates: true });
    return true;
  } catch {
    // Deja present (cas normal) ou creation impossible : on verifie que le
    // repertoire existe pour distinguer les deux cas.
    try {
      const info = await FileSystem.getInfoAsync(dir);
      return info.exists;
    } catch {
      return false;
    }
  }
}

/**
 * Lit la map de metadata du cache, sans confiance : JSON corrompu, entrees
 * hors catalogue ou mal typees sont ignorees (jamais un crash).
 */
export async function loadAnimationCacheMeta(): Promise<AnimationCacheMeta> {
  try {
    const raw = await AsyncStorage.getItem(ANIMATION_CACHE_META_KEY);
    if (raw === null) return {};
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
      return {};
    }
    const out: AnimationCacheMeta = {};
    for (const [fileName, value] of Object.entries(
      parsed as Record<string, unknown>
    )) {
      // Une cle hors catalogue ne peut pas designer un fichier lu par le
      // preview : ignoree (defense en profondeur, jamais un chemin arbitraire).
      if (!isKnownAnimationFileName(fileName)) continue;
      if (typeof value !== "object" || value === null) continue;
      const v = value as Record<string, unknown>;
      const sizeBytes =
        typeof v.sizeBytes === "number" && Number.isFinite(v.sizeBytes)
          ? v.sizeBytes
          : 0;
      const cachedAt = typeof v.cachedAt === "string" ? v.cachedAt : "";
      out[fileName] = { sizeBytes, cachedAt };
    }
    return out;
  } catch (error) {
    if (__DEV__) console.warn("[animationCache] meta read failed", error);
    return {};
  }
}

/**
 * Enregistre (ou rafraichit) la metadata d'une animation telechargee.
 *
 * A appeler APRES le renommage `.part` -> final.
 *
 * @throwspropagate les erreurs AsyncStorage : un echec d'ecriture doit etre
 *   visible par l'appelant.
 */
export async function saveAnimationCacheEntry(
  fileName: string,
  sizeBytes: number
): Promise<void> {
  const meta = await loadAnimationCacheMeta();
  meta[fileName] = {
    sizeBytes,
    cachedAt: new Date().toISOString(),
  };
  await AsyncStorage.setItem(ANIMATION_CACHE_META_KEY, JSON.stringify(meta));
}

/** Resultat d'une recherche de cache pour une animation. */
export type CachedAnimation = {
  /** URI FileSystem du binaire pret a lire. */
  fileUri: string;
  /** Taille en octets (fichier reel si disponible, sinon metadata). */
  sizeBytes: number;
};

/**
 * Retrouve une animation en cache, si le binaire est REELLEMENT present.
 *
 * @returns `{fileUri, sizeBytes}` ou `null` (metadata absente, stockage
 *   indisponible, ou fichier purge par l'OS — traite comme cache-miss).
 */
export async function getCachedAnimation(
  fileName: string
): Promise<CachedAnimation | null> {
  if (!isKnownAnimationFileName(fileName)) return null;
  const meta = await loadAnimationCacheMeta();
  const entry = meta[fileName];
  if (entry === undefined) return null;
  const file = animationFileUri(fileName);
  if (file === null) return null;
  try {
    const info = await FileSystem.getInfoAsync(file);
    if (!info.exists) return null;
    return {
      fileUri: file,
      sizeBytes: typeof info.size === "number" ? info.size : entry.sizeBytes,
    };
  } catch {
    return null;
  }
}

/**
 * Lit le binaire d'une animation depuis le cache.
 *
 * Pass par `readAsStringAsync` Base64 + decode pur : `fetch(file://)` n'est
 * pas fiable sur le document directory Android (lecon 15/09).
 *
 * @param fileUri URI FileSystem d'un fichier de cache.
 * @throws si la lecture ou le decodage echoue (l'appelant affiche l'erreur).
 */
export async function readAnimationBuffer(
  fileUri: string
): Promise<ArrayBuffer> {
  const base64 = await FileSystem.readAsStringAsync(fileUri, {
    encoding: FileSystem.EncodingType.Base64,
  });
  return decodeBase64(base64);
}

/**
 * Purge une animation (binaire + metadata). Idempotent, jamais un crash si
 * le fichier est deja absent.
 */
export async function purgeAnimation(fileName: string): Promise<void> {
  const file = animationFileUri(fileName);
  if (file !== null) {
    try {
      await FileSystem.deleteAsync(file, { idempotent: true });
    } catch (error) {
      if (__DEV__) console.warn("[animationCache] file purge failed", error);
    }
  }
  try {
    const meta = await loadAnimationCacheMeta();
    if (!(fileName in meta)) return;
    delete meta[fileName];
    await AsyncStorage.setItem(ANIMATION_CACHE_META_KEY, JSON.stringify(meta));
  } catch (error) {
    if (__DEV__) console.warn("[animationCache] meta purge failed", error);
  }
}

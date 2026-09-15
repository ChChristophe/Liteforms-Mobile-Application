import AsyncStorage from "@react-native-async-storage/async-storage";
import { create } from "zustand";
import * as FileSystem from "expo-file-system/legacy";
import { isGlbBuffer } from "../avatar/nativeTextureSupport";
import { decodeBase64 } from "./base64";

/**
 * VRM resident sur le telephone (decision D2, 15/09/2026).
 *
 * Contrainte D2 : UN SEUL VRM resident a la fois (pas de bibliotheque
 * locale) — le telechargement depuis le Desktop REMPLACE celui en place.
 * Ecriture atomique : le binaire arrive en `.part` (cote
 * `lib/network/vrmDownload`) puis est renomme sur le nom final, jamais
 * observe a moitie ecrit par le preview.
 *
 * Regles de la couche :
 * - le binaire vit UNIQUEMENT en FileSystem (documentDirectory, pas le
 *   cache purgable par l'OS) ; AsyncStorage ne porte que le petit snapshot
 *   de metadata (fileName, hash md5) — jamais un binaire ;
 * - `configStore.avatar.modelRef` reste la reference contractuelle envoyee
 *   au Desktop : les metadata resident sont un detail de storage pour le
 *   preview, jamais une seconde source de verite pour l'envoi ;
 * - un resident illisible/corrompu est signale (`status: "invalid"`),
 *   jamais fatal : le preview retombe sur le binaire bundle avec
 *   avertissement visible ;
 * - duree de vie (lecon Phase 4) : ce fichier n'est jamais purge pendant un
 *   render en cours ; l'ecriture passe par le renommage atomique `.part` →
 *   final et il n'existe jamais de suppression en cycle de rendu (la purge
 *   texture cache reste au demontage) ;
 * - resident de nom = bundle (`lobsterEdit.vrm`) → le bundle est prefere
 *   (deja en place, meilleur temps de chargement).
 */

/** Cle AsyncStorage des metadata resident (metadata only, jamais binaire). */
export const RESIDENT_VRM_META_KEY = "liteforms.residentVrm";

/** Nom du modele bundle par defaut : resident de ce nom => bundle prefere. */
export const BUNDLED_VRM_FILE_NAME = "lobsterEdit.vrm";

/** Nom fixe du fichier resident (un seul, D2) sous le document directory. */
const RESIDENT_FILE_NAME = "liteforms-resident.vrm";

/**
 * URI du fichier resident (attente du telechargement, lecture preview).
 * `null` si le document directory est indisponible : le resident est alors
 * desactive pur et simple (le preview reste sur le bundle).
 */
export function residentVrmFileUri(): string | null {
  return FileSystem.documentDirectory === null
    ? null
    : `${FileSystem.documentDirectory}${RESIDENT_FILE_NAME}`;
}

/** URI du fichier temporaire de telechargement, renomme en final ensuite. */
export function residentVrmPartUri(): string | null {
  const file = residentVrmFileUri();
  return file === null ? null : `${file}.part`;
}

/**
 * Snapshot simple des metadata du fichier resident (un seul a la fois, D2).
 * `hash` est le md5 calcule par expo-file-system au telechargement (D2/D4 :
 * reference `modelRef {id, fileName, hash}`).
 */
export type ResidentVrmMeta = {
  fileName: string;
  hash: string | null;
};

/** Resultat de `loadResidentVrm` pour le preview. */
export type ResidentVrmLoad =
  | { status: "none"; reason: "absent" | "builtin-named" }
  | { status: "resident"; buffer: ArrayBuffer; fileName: string }
  | { status: "invalid"; message: string };

/** Store zustand minimal : version, bump a chaque changement du resident. */
export const useResidentVrmStore = create<{ version: number }>(() => ({
  version: 0,
}));

/** Abonnement du preview : incremente a chaque save/clear du resident. */
export function useResidentVrmVersion(): number {
  return useResidentVrmStore((state) => state.version);
}

function bumpResidentVersion(): void {
  const increment = useResidentVrmStore.getState().version + 1;
  useResidentVrmStore.setState({ version: increment });
}

/**
 * Lit les metadata du resident depuis AsyncStorage, sans confiance : JSON
 * corrompu, fileName non-texte ou autre type => `null` (le preview retombe
 * sur le bundle, jamais un crash).
 */
export async function loadResidentVrmMeta(): Promise<ResidentVrmMeta | null> {
  try {
    const raw = await AsyncStorage.getItem(RESIDENT_VRM_META_KEY);
    if (raw === null) return null;
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null) return null;
    const fileName = (parsed as Record<string, unknown>).fileName;
    if (typeof fileName !== "string") return null;
    const hash = (parsed as Record<string, unknown>).hash;
    return {
      fileName,
      hash: typeof hash === "string" ? hash : null,
    };
  } catch (error) {
    if (__DEV__) console.warn("[residentVrm] meta read failed", error);
    return null;
  }
}

/**
 * Persiste les metadata du resident (APRES le renommage `.part` → final
 * du telechargement) et bump la version — le preview abonne recharge son
 * runtime (rechargement runtime sur le meme contexte, Phase 4.2).
 *
 * @throwspropagate les erreurs AsyncStorage : un echec d'ecriture doit etre
 *   visible par l'appelant, pas masque.
 */
export async function saveResidentVrmMeta(meta: ResidentVrmMeta): Promise<void> {
  await AsyncStorage.setItem(RESIDENT_VRM_META_KEY, JSON.stringify(meta));
  bumpResidentVersion();
}

/**
 * Supprime le resident (binaire + metadata) : utilise quand l'utilisateur
 * selectionne un modele builtin (le bundle est deja en place ; un seul
 * resident a la fois, D2). Idempotent, jamais un crash si le fichier est
 * deja absent.
 */
export async function clearResidentVrm(): Promise<void> {
  try {
    await AsyncStorage.removeItem(RESIDENT_VRM_META_KEY);
  } catch (error) {
    if (__DEV__) console.warn("[residentVrm] meta clear failed", error);
  }
  const file = residentVrmFileUri();
  if (file !== null) {
    try {
      await FileSystem.deleteAsync(file, { idempotent: true });
    } catch (error) {
      if (__DEV__) console.warn("[residentVrm] file clear failed", error);
    }
  }
  bumpResidentVersion();
}

/**
 * Charge le binaire du resident pour le preview natif.
 *
 * Statuts :
 * - `none` : pas de metadata (absent) ou metadata pointant le bundle —
 *   le preview utilise le binaire bundle sans avertissement ;
 * - `resident` : binaire lu et magic GLB `glTF` verifie (un residu non-3D —
 *   ex. page HTML d'erreur — ne peut pas passer) ;
 * - `invalid` : metadata presentes mais fichier absent/illisible — message
 *   affichable, JAMAIS un crash : le preview retombe sur le bundle avec
 *   l'avertissement visible.
   */
export async function loadResidentVrm(): Promise<ResidentVrmLoad> {
  const meta = await loadResidentVrmMeta();
  if (meta === null) return { status: "none", reason: "absent" };
  if (meta.fileName === BUNDLED_VRM_FILE_NAME) {
    return { status: "none", reason: "builtin-named" };
  }
  const file = residentVrmFileUri();
  if (file === null) {
    return {
      status: "invalid",
      message: "VRM résident indisponible : le modèle intégré est affiché.",
    };
  }
  let buffer: ArrayBuffer | null = null;
  try {
    // Lecture via expo-file-system (readAsStringAsync Base64), JAMAIS
    // `fetch(file://)` arbitraire : seul le cache d'assets bundle a un chemin
    // fetch promis sur RN (leçon 15/09 — Network request failed / HTTP 0 sur
    // Android pour un file:// du document directory).
    buffer = await readResidentBuffer(file);
    if (!isGlbBuffer(buffer)) {
      throw new Error("conteneur GLB invalide (magic absent)");
    }
    return { status: "resident", buffer, fileName: meta.fileName };
  } catch (error) {
    // Memoire (lecture unique au chargement) : cout transitoire ~1,3x le
    // binaire (string base64 + ArrayBuffer), acceptable pour un VRM de
    // dizaines de Mo ; pas de conservation du tampon apres le retour.
    if (__DEV__) console.warn("[residentVrm] resident read failed", error);
    // Diagnostic sans divination : taille lue (0 si lecture ratee) + 4
    // premiers octets ASCII comparables (divergence fichier vide / tronque /
    // HTML d'erreur / mauvais magic). Aucun octet binaire dans le message.
    const byteLength = buffer?.byteLength ?? 0;
    const firstBytes = buffer !== null ? asciiPrefix(buffer, 4) : "";
    const cause = error instanceof Error ? error.message : "erreur inconnue";
    return {
      status: "invalid",
      message:
        `VRM résident illisible ou corrompu (${byteLength} octets lus` +
        (firstBytes ? `, début « ${firstBytes} »` : "") +
        ` ; ${cause}) : le modèle intégré est affiché.`,
    };
  }
}

/**
 * Lit le binaire resident via expo-file-system : readAsStringAsync en
 * Base64 puis decodage pur (RN n'a pas d'atob garanti sur tous les runtimes).
 */
async function readResidentBuffer(file: string): Promise<ArrayBuffer> {
  const base64 = await FileSystem.readAsStringAsync(file, {
    encoding: FileSystem.EncodingType.Base64,
  });
  return decodeBase64(base64);
}

/** 4 premiers octets -> ASCII imprimable comparable ("?" pour le reste). */
function asciiPrefix(buffer: ArrayBuffer, max: number): string {
  const head = new Uint8Array(buffer, 0, Math.min(max, buffer.byteLength));
  let text = "";
  for (const byte of head) {
    text += byte >= 0x20 && byte < 0x7f ? String.fromCharCode(byte) : "?";
  }
  return text;
}


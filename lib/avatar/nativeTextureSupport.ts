import { Asset } from "expo-asset";
// SDK 57 : l'API historique FileSystem vit dans le sous-chemin `legacy`.
import * as FileSystem from "expo-file-system/legacy";
import { Image } from "react-native";
import * as THREE from "three";

/**
 * Pont de chargement de textures pour Expo GL (PLAN.md Phase 4.3).
 *
 * Les loaders web de three (ImageLoader, ImageBitmapLoader) s'appuient sur
 * canvas/Image, absents sous React Native. Au lieu du hack data-URI du POC
 * (qui multiplie la mémoire), ce module branché SCOPÉMENT :
 * 1. "URL.createObjectURL" renvoie une fausse URL registre — GLTFLoader fait
 *    exactement ça pour les textures EMBARQUÉES (bufferView) d'un GLB/VRM ;
 * 2. "THREE.ImageBitmapLoader.prototype.load" (chemin des textures
 *    embarquées) résout la source depuis le registre et écrit le binaire
 *    dans un fichier FileSystem, puis produit une image expo-gl au format
 *    `{localUri}` — seule forme JS supportée par `texImage2D` sous Expo
 *    (cf. GLView docs) ;
 * 3. "THREE.TextureLoader.prototype.load" (textures URL externes) passe par
 *    `FileSystem.downloadAsync` puis `{localUri}`.
 *
 * ponytail: la lecture interne d'un blob RN passe par `_data.parts` du
 * polyfill RN — seule voie disponible ; bascule sur un décodage natif si RN
 * l'élimine.
 *
 * Le patch est installé le temps du chargement puis désinstallé : jamais un
 * monkey-patch global permanent comme le faisait le POC.
 */

/** Registre fausses URLs "liteforms-blob://" → Promise<ArrayBuffer>. */
const objectURLRegistry = new Map<string, Promise<ArrayBuffer>>();
/** Cle cachee portee par les faux Blobverses notre registre. */
const HIDDEN_BUFFER_KEY = "_liteformsArrayBuffer";
/** Fichiers cache texture en attente de suppression (sous-phase 4.3). */
const tempFiles: string[] = [];

let objectUrlCounter = 0;

/**
 * Écrit un binaire dans un fichier cache (base64) et renvoie son URI.
 * @param extensionHint extension d'image placé pour le decodeur natif.
 */
async function writeBufferToCacheFile(
  buffer: ArrayBuffer,
  extensionHint: string
): Promise<string | null> {
  const cacheDir = FileSystem.cacheDirectory;
  if (cacheDir === null) return null;
  const fileUri = `${cacheDir}liteforms-tex-${Date.now()}-${tempFiles.length}.${extensionHint}`;
  try {
    const base64 = FileSystem.EncodingType.Base64;
    const bytes = new Uint8Array(buffer);
    let binary = "";
    const chunk = 0x8000;
    for (let i = 0; i < bytes.length; i += chunk) {
      binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
    }
    await FileSystem.writeAsStringAsync(fileUri, btoa(binary), {
      encoding: base64,
    });
  } catch (error) {
    if (__DEV__) console.warn("[nativeTexture] cache write failed", error);
    return null;
  }
  tempFiles.push(fileUri);
  return fileUri;
}

/** Extrait l'ArrayBuffer d'un Blob React Native. */
async function blobToArrayBuffer(blob: Blob): Promise<ArrayBuffer> {
  // Le polyfill RN peut manquer la methode standard : detection a la main.
  const maybeArrayBuffer = (
    blob as unknown as { arrayBuffer?: () => Promise<ArrayBuffer> }
  ).arrayBuffer;
  if (typeof maybeArrayBuffer === "function") {
    return maybeArrayBuffer.call(blob);
  }
  // ponytail: dépend de `_data.parts`, propriété interne du polyfill RN ; si
  // RN la supprime, remplacer par un décodage natif (upgrade prévu).
  const parts = (blob as unknown as { _data?: { parts?: Array<ArrayBuffer | string> } })
    ._data?.parts;
  if (!parts) throw new Error("cannot read RN Blob internals");
  const buffers = parts.map((part) =>
    typeof part === "string"
      ? new TextEncoder().encode(part).buffer
      : (part as ArrayBuffer)
  );
  const total = buffers.reduce((sum, b) => sum + b.byteLength, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const b of buffers) {
    out.set(new Uint8Array(b), offset);
    offset += b.byteLength;
  }
  return out.buffer;
}

const EXT_HINT_BY_MIME: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
};

/**
 * Dimensions natives d'une image locale (RN `Image.getSize`, file:// OK).
 * Obligatoire : three lit `image.width/height` pour texStorage2D / mipmaps.
 */
function getImageDimensions(
  localUri: string
): Promise<{ width: number; height: number } | null> {
  return new Promise((resolve) => {
    Image.getSize(
      localUri,
      (width, height) => resolve({ width, height }),
      () => resolve(null)
    );
  });
}

/**
 * Construit l'objet image que three doit recevoir comme source de texture.
 *
 * Contrat natif (expo-gl `EXGLImageUtils.cpp:loadImage`) : l'objet passe en
 * `pixels` a `texImage2D`/`texSubImage2D` doit porter une propriete
 * `localUri` de forme `file://...` ; c'est la seule cle lue. three, chemin
 * "regular texture", passe `texture.image` EN ENTIER a `texSubImage2D`
 * (argc=7) et lit `image.width/height` pour l'allocation `texStorage2D`.
 * On fournit donc `{ localUri, width, height }` directement. Ne PAS marquer
 * `isDataTexture` (three passerait alors `image.data`, qui ne contiendrait
 * plus de `localUri` exploitable) ni emballer dans un `Asset` :
 * `Asset.fromURI` laisse `localUri` null tant que `downloadAsync` n'a pas
 * tourne, ce qui produisait un upload vide => avatar noir.
 */
async function buildLocalUriImage(
  localUri: string
): Promise<{ localUri: string; width: number; height: number } | null> {
  const dimensions = await getImageDimensions(localUri);
  if (dimensions === null) return null;
  return { localUri, width: dimensions.width, height: dimensions.height };
}

/**
 * Attache une source expo-gl a une texture (`{ localUri, width, height }`).
 * @returns false si les dimensions natives sont indechiffrables.
 */
async function attachLocalUriImage(
  texture: THREE.Texture,
  localUri: string
): Promise<boolean> {
  const image = await buildLocalUriImage(localUri);
  if (image === null) return false;
  texture.image = image;
  texture.needsUpdate = true;
  return true;
}

/**
 * Installe le pont natif de textures et renvoie le désinstallateur.
 *
 * Portée exigée par le plan (Phase 0/4) : install → chargement d'assets →
 * uninstall, patches restaurés après usage.
 */
export function installNativeTextureSupport(): () => void {
  const globalAny = globalThis as unknown as {
    URL: {
      createObjectURL: (obj: Blob) => string;
      revokeObjectURL: (url: string) => void;
    };
    Blob: typeof Blob;
  };

  const originalCreateObjectURL = globalAny.URL?.createObjectURL;
  const originalRevokeObjectURL = globalAny.URL?.revokeObjectURL;
  const originalTextureLoad = THREE.TextureLoader.prototype.load;
  const originalBitmapLoad = THREE.ImageBitmapLoader.prototype.load;
  const OriginalBlob = globalAny.Blob;

  // Blob : three cree "new Blob([ArrayBuffer])" AVANT createObjectURL, et le
  // polyfill RN refuse les buffers. On intercepte la construction : un faux
  // Blob (objet neutre) porte le buffer vers notre createObjectURL.
  if (typeof OriginalBlob === "function") {
    const patchedBlob = function LiteformsBlob(
      parts?: BlobPart[],
      options?: BlobPropertyBag
    ): Blob {
      void options;
      // three peut passer un ArrayBuffer nu OU une vue typee (subarray du GLB).
      const rawPart = parts?.find(
        (part) =>
          part instanceof ArrayBuffer ||
          (part != null && ArrayBuffer.isView(part as object))
      );
      const bufferPart =
        rawPart instanceof ArrayBuffer
          ? rawPart
          : rawPart != null && ArrayBuffer.isView(rawPart)
            ? (rawPart as Uint8Array).slice().buffer
            : new ArrayBuffer(0);
      const fake = Object.create(null) as Blob & Record<string, unknown>;
      Object.defineProperty(fake, HIDDEN_BUFFER_KEY, {
        value: bufferPart,
        enumerable: false,
      });
      return fake;
    } as unknown as typeof Blob;
    globalAny.Blob = patchedBlob;
  }

  if (typeof originalCreateObjectURL === "function") {
    globalAny.URL.createObjectURL = (obj: Blob): string => {
      const fakeUrl = `liteforms-blob://${objectUrlCounter++}`;
      const hidden = (
        obj as unknown as Record<string, unknown>
      )[HIDDEN_BUFFER_KEY];
      if (hidden instanceof ArrayBuffer) {
        objectURLRegistry.set(fakeUrl, Promise.resolve(hidden));
      } else if (typeof (obj as { arrayBuffer?: () => Promise<ArrayBuffer> }).arrayBuffer === "function") {
        objectURLRegistry.set(fakeUrl, obj.arrayBuffer());
      } else {
        objectURLRegistry.set(
          fakeUrl,
          Promise.reject(new Error("unsupported blob source"))
        );
      }
      return fakeUrl;
    };
    globalAny.URL.revokeObjectURL = () => undefined;
  }

  // Textures EMBARQUÉES (bufferView) : GLTFLoader route via ImageBitmapLoader.
  THREE.ImageBitmapLoader.prototype.load = function patchedBitmapLoad(
    this: THREE.ImageBitmapLoader,
    fakeUrl: string,
    onLoad?: (image: unknown) => void,
    onProgress?: (event: ProgressEvent) => void,
    onError?: (e: unknown) => void
  ): THREE.ImageBitmapLoader {
    void onProgress; // expo-gl ne consomme pas les progress events
    const pending = objectURLRegistry.get(fakeUrl);
    if (!pending) {
      onError?.(new Error(`texture source unavailable: ${fakeUrl}`));
      return this;
    }
    void pending
      .then((buffer) => writeBufferToCacheFile(buffer, "png"))
      .then(async (localUri) => {
        if (localUri === null) {
          onError?.(new Error("texture cache write failed"));
          return;
        }
        const image = await buildLocalUriImage(localUri);
        if (image === null) {
          onError?.(new Error("texture size decode failed"));
          return;
        }
        // Chemin ImageBitmapLoader : three enveloppe ce "bitmap" dans un
        // `new Texture(...)` ; il doit donc porter `localUri` + dimensions.
        onLoad?.(image);
      })
      .catch(onError);
    return this;
  } as unknown as typeof THREE.ImageBitmapLoader.prototype.load;

  // Textures par URL : GLTFLoader choisit TextureLoader quand
  // createImageBitmap est absent (cas RN) — il recoit donc aussi nos fausses
  // URLs "liteforms-blob://" (textures embarquees). Regle unifiee :
  // registre blob → fichier cache → image {localUri}.
  THREE.TextureLoader.prototype.load = function patchedTextureLoad(
    url: string,
    onLoad?: (texture: THREE.Texture) => void,
    onProgress?: (event: ProgressEvent) => void,
    onError?: (e: unknown) => void
  ): THREE.Texture {
    void onProgress;
    const texture = new THREE.Texture();

    const blobPending = objectURLRegistry.get(url);
    if (blobPending !== undefined) {
      void blobPending
        .then((buffer) => writeBufferToCacheFile(buffer, "png"))
        .then(async (localUri) => {
          if (localUri === null) {
            onError?.(new Error("texture cache write failed"));
            return;
          }
          const attached = await attachLocalUriImage(texture, localUri);
          if (!attached) {
            onError?.(new Error("texture size decode failed"));
            return;
          }
          onLoad?.(texture);
        })
        .catch(onError);
      return texture;
    }

    if (!/^[a-z0-9][a-z0-9+.-]*:/i.test(url)) {
      onError?.(new Error(`unsupported texture url: ${url}`));
      return texture;
    }
    const cachePath = `${FileSystem.cacheDirectory}liteforms-tex-${Date.now()}`;
    FileSystem.downloadAsync(url, cachePath)
      .then(async (result) => {
        tempFiles.push(result.uri);
        const attached = await attachLocalUriImage(texture, result.uri);
        if (!attached) {
          onError?.(new Error("texture size decode failed"));
          return;
        }
        onLoad?.(texture);
      })
      .catch(onError);
    return texture;
  } as unknown as typeof THREE.TextureLoader.prototype.load;

  return () => {
    THREE.TextureLoader.prototype.load = originalTextureLoad;
    THREE.ImageBitmapLoader.prototype.load = originalBitmapLoad;
    if (originalCreateObjectURL) globalAny.URL.createObjectURL = originalCreateObjectURL;
    if (originalRevokeObjectURL) globalAny.URL.revokeObjectURL = originalRevokeObjectURL;
    if (typeof OriginalBlob === "function") globalAny.Blob = OriginalBlob;
    objectURLRegistry.clear();
    // NE PAS purger ici : three.js lit les fichiers texture au PREMIER render
    // (upload GPU via stbi_load), qui arrive APRES cet uninstall. La purge
    // se fait dans purgeTextureCache(), appelee au demontage du composant.
  };
}

/**
 * Suppression best-effort des fichiers textures du cache (sous-phase 4.3).
 *
 * Doit etre appelee SEULEMENT apres le dernier render (au demontage du
 * GLView). three.js charge le binaire texture paresseusement au premier
 * `renderer.render()` ; purger avant = texture vide => avatar noir.
 */
export async function purgeTextureCache(): Promise<void> {
  // Snapshot : splice empeche de supprimer une fichier ajoute PENDANT la
  // purge (ex. chargement du montage suivant deja demarre).
  const files = tempFiles.splice(0, tempFiles.length);
  for (const file of files) {
    try {
      await FileSystem.deleteAsync(file, { idempotent: true });
    } catch {
      // fichier déjà parti : ignorer
    }
  }
}

/** Méthode de secours : init de l'asset cache potentiellement pourri. */
function readGLBHeader(buffer: ArrayBuffer): { magic: string; text: string } {
  const header = new Uint8Array(buffer, 0, Math.min(8, buffer.byteLength));
  const text = String.fromCharCode(...header);
  return { magic: String.fromCharCode(...header.subarray(0, 4)), text };
}

/** Indique si le buffer est un conteneur GLB valide ("glTF"). */
function isGlbBuffer(buffer: ArrayBuffer): boolean {
  return readGLBHeader(buffer).magic === "glTF";
}

/**
 * Charge un asset bundle (vrm/glb/vrma) en ArrayBuffer local.
 *
 * Auto-reparation cache : si le fichier local est un faux (ex. un residu
 * "File not found" d'une session ou la config Metro n'etait pas chargee),
 * il est supprime et retéléchargé une fois. Sans ca, un asset pourri en
 * cache reste permanent (downloaded=true court-circuite le rechargement).
 *
 * @param moduleId retour de `require(".../fichier.vrm")` (module Metro).
 * @returns ArrayBuffer du binaire, prêt pour `GLTFLoader.parse`.
 * @throws avec URI et premiers octets si le serveur cache ne répère pas.
 */
export async function loadBundledAssetBuffer(
  moduleId: number
): Promise<ArrayBuffer> {
  const asset = Asset.fromModule(moduleId);
  async function readLocal(): Promise<ArrayBuffer> {
    // RN fetch supporte `file://` pour les fichiers locaux de l'application.
    const response = await fetch(asset.localUri ?? asset.uri);
    return response.arrayBuffer();
  }

  let buffer = await readLocal();
  if (!isGlbBuffer(buffer) && asset.localUri !== null) {
    // Recache : purge du fichier pourri puis re-téléchargement forcé.
    if (__DEV__) {
      const { text } = readGLBHeader(buffer);
      console.warn("[AvatarPreview] asset cache stale, re-téléchargement", {
        uri: asset.localUri,
        firstBytes: text,
      });
    }
    await FileSystem.deleteAsync(asset.localUri, { idempotent: true });
    await asset.downloadAsync();
    buffer = await readLocal();
  }

  if (!isGlbBuffer(buffer)) {
    const { text } = readGLBHeader(buffer);
    throw new Error(
      `binaire 3D invalide: URI=${asset.localUri ?? asset.uri} ` +
        `magic="${text}" (longueur=${buffer.byteLength})`
    );
  }
  return buffer;
}

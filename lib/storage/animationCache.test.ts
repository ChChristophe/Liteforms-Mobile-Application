import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Tests du cache d'animations (apercu local, plusieurs fichiers) :
 * - metadata AsyncStorage lue sans confiance (hors catalogue/corrompue =
 *   ignoree) ;
 * - cache-miss si le binaire a ete purge par l'OS (metadata orpheline) ;
 * - lecture par readAsStringAsync Base64 + decode pur (jamais fetch file://) ;
 * - purge idempotente (binaire + metadata).
 */

(globalThis as { __DEV__?: boolean }).__DEV__ = false;

const memoryData = new Map<string, string>();
vi.mock("@react-native-async-storage/async-storage", () => ({
  default: {
    getItem: async (key: string) => memoryData.get(key) ?? null,
    setItem: async (key: string, value: string) =>
      void memoryData.set(key, value),
    removeItem: async (key: string) => void memoryData.delete(key),
  },
}));

/** Repertoires crees + fichiers presents (uri -> { base64, size }). */
const knownDirs = new Set<string>();
const files = new Map<string, { base64: string; size: number }>();
vi.mock("expo-file-system/legacy", () => ({
  documentDirectory: "file:///docs/",
  EncodingType: { Base64: "base64" },
  makeDirectoryAsync: vi.fn(async (uri: string) => {
    if (knownDirs.has(uri)) throw new Error("directory already exists");
    knownDirs.add(uri);
  }),
  getInfoAsync: vi.fn(async (uri: string) => {
    if (uri.endsWith("/")) {
      return { exists: knownDirs.has(uri), isDirectory: true, uri };
    }
    const file = files.get(uri);
    return file === undefined
      ? { exists: false, isDirectory: false, uri }
      : { exists: true, isDirectory: false, uri, size: file.size };
  }),
  deleteAsync: vi.fn(async (uri: string) => {
    files.delete(uri);
  }),
  readAsStringAsync: vi.fn(async (uri: string) => {
    const file = files.get(uri);
    if (file === undefined) throw new Error(`fichier introuvable : ${uri}`);
    return file.base64;
  }),
}));

import { toBase64 } from "./base64.test";
import {
  ANIMATION_CACHE_META_KEY,
  animationCacheDirUri,
  animationFileUri,
  ensureAnimationCacheDir,
  getCachedAnimation,
  loadAnimationCacheMeta,
  purgeAnimation,
  readAnimationBuffer,
  saveAnimationCacheEntry,
} from "./animationCache";

/** Installe un fichier de cache (base64) avec sa taille reelle. */
function mockCachedFile(fileName: string, bytes: Uint8Array): string {
  const uri = animationFileUri(fileName);
  if (uri === null) throw new Error("stockage indisponible");
  files.set(uri, { base64: toBase64(bytes), size: bytes.byteLength });
  return uri;
}

beforeEach(() => {
  memoryData.clear();
  knownDirs.clear();
  files.clear();
});

describe("ensureAnimationCacheDir", () => {
  it("cree le repertoire dedie, idempotent", async () => {
    const dir = animationCacheDirUri();
    expect(dir).toBe("file:///docs/liteforms-animations/");
    expect(await ensureAnimationCacheDir()).toBe(true);
    expect(knownDirs.has(dir as string)).toBe(true);
    // Deuxieme appel : makeDirectoryAsync echoue mais le repertoire existe.
    expect(await ensureAnimationCacheDir()).toBe(true);
  });
});

describe("loadAnimationCacheMeta", () => {
  it("retourne une map vide sans metadata", async () => {
    expect(await loadAnimationCacheMeta()).toEqual({});
  });

  it("lit les entrees valides et ignore les cles hors catalogue/corrompues", async () => {
    memoryData.set(
      ANIMATION_CACHE_META_KEY,
      JSON.stringify({
        "Greeting.vrma": { sizeBytes: 1024, cachedAt: "2026-09-18T00:00:00Z" },
        "idle.vrma": { sizeBytes: 10, cachedAt: "x" },
        "../evil.vrma": { sizeBytes: 10, cachedAt: "x" },
        "Sad.vrma": "pas un objet",
      })
    );
    expect(await loadAnimationCacheMeta()).toEqual({
      "Greeting.vrma": {
        sizeBytes: 1024,
        cachedAt: "2026-09-18T00:00:00Z",
      },
    });
  });

  it("JSON corrompu : map vide, jamais un crash", async () => {
    memoryData.set(ANIMATION_CACHE_META_KEY, "{pas du json");
    expect(await loadAnimationCacheMeta()).toEqual({});
  });
});

describe("saveAnimationCacheEntry / getCachedAnimation", () => {
  it("enregistre puis retrouve une animation presente", async () => {
    const uri = mockCachedFile("Greeting.vrma", new Uint8Array([1, 2, 3, 4]));
    await saveAnimationCacheEntry("Greeting.vrma", 4);
    expect(await getCachedAnimation("Greeting.vrma")).toEqual({
      fileUri: uri,
      sizeBytes: 4,
    });
  });

  it("cache-miss si la metadata existe mais le fichier a ete purge", async () => {
    await saveAnimationCacheEntry("Greeting.vrma", 4);
    expect(await getCachedAnimation("Greeting.vrma")).toBeNull();
  });

  it("cache-miss si aucune metadata ou nom hors catalogue", async () => {
    mockCachedFile("Greeting.vrma", new Uint8Array([1]));
    expect(await getCachedAnimation("Greeting.vrma")).toBeNull();
    expect(await getCachedAnimation("../evil.vrma")).toBeNull();
  });
});

describe("readAnimationBuffer", () => {
  it("lit le binaire via Base64 + decode pur", async () => {
    const uri = mockCachedFile("Sad.vrma", new Uint8Array([0x67, 0x6c, 0x54, 0x46]));
    const buffer = await readAnimationBuffer(uri);
    expect(Array.from(new Uint8Array(buffer))).toEqual([0x67, 0x6c, 0x54, 0x46]);
  });

  it("propage l'erreur si le fichier est absent (l'appelant affiche)", async () => {
    await expect(
      readAnimationBuffer("file:///docs/liteforms-animations/absent.vrma")
    ).rejects.toThrow(/introuvable/);
  });
});

describe("purgeAnimation", () => {
  it("supprime le binaire et la metadata, idempotent", async () => {
    const uri = mockCachedFile("Spin.vrma", new Uint8Array([9, 9]));
    await saveAnimationCacheEntry("Spin.vrma", 2);

    await purgeAnimation("Spin.vrma");
    expect(files.has(uri)).toBe(false);
    expect(await loadAnimationCacheMeta()).toEqual({});

    // Deuxieme appel : aucun fichier/metadata, jamais un crash.
    await expect(purgeAnimation("Spin.vrma")).resolves.toBeUndefined();
  });
});

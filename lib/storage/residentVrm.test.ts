import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Tests du stockage "un seul VRM resident" (D2, 15/09/2026) :
 * - metadata AsyncStorage validees sans confiance (corrompu = absent) ;
 * - dictamen preview : absent -> bundle silencieux, builtin-named -> bundle,
 *   corrompu/magic invalide -> `invalid` avec message affichable, JAMAIS un
 *   crash ; binaire valide -> buffer prêt pour GLTFLoader.parse ;
 * - version : bump a chaque save/clear (rechargement preview).
 */

(globalThis as { __DEV__?: boolean }).__DEV__ = false;

/** AsyncStorage mocke en Memoire (metadata only, jamais de binaire ici). */
const memoryData = new Map<string, string>();
vi.mock("@react-native-async-storage/async-storage", () => ({
  default: {
    getItem: async (key: string) => memoryData.get(key) ?? null,
    setItem: async (key: string, value: string) =>
      void memoryData.set(key, value),
    removeItem: async (key: string) => void memoryData.delete(key),
  },
}));

/** FileSystem mocke : documentDirectory fixe, deleteAsync journalise. */
const deletedFiles: string[] = [];
vi.mock("expo-file-system/legacy", () => ({
  documentDirectory: "file:///docs/",
  deleteAsync: vi.fn(async (uri: string) => void deletedFiles.push(uri)),
}));

/** isGlbBuffer re-implemente au test (magic 4 octets "glTF"). */
vi.mock("../avatar/nativeTextureSupport", () => ({
  isGlbBuffer: (buffer: ArrayBuffer): boolean => {
    const header = new Uint8Array(buffer, 0, 4);
    return String.fromCharCode(...header) === "glTF";
  },
}));

import {
  clearResidentVrm,
  BUNDLED_VRM_FILE_NAME,
  RESIDENT_VRM_META_KEY,
  loadResidentVrm,
  loadResidentVrmMeta,
  saveResidentVrmMeta,
  useResidentVrmStore,
} from "./residentVrm";

/** Buffer GLB valide (magic "glTF" + octets fictifs). */
function makeGlbBuffer(): ArrayBuffer {
  const bytes = new Uint8Array(16);
  bytes.set([0x67, 0x6c, 0x54, 0x46]); // "glTF"
  bytes.set([1, 2, 3, 4], 4);
  return bytes.buffer;
}

/** fetch global : sert le buffer ou echoue selon le test. */
function mockFetchWith(buffer: ArrayBuffer | null, status = 200): void {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => {
      if (buffer === null) {
        throw new TypeError("Network request failed");
      }
      return {
        ok: status >= 200 && status < 300,
        status,
        arrayBuffer: async () => buffer,
      } as unknown as Response;
    })
  );
}

beforeEach(() => {
  memoryData.clear();
  deletedFiles.length = 0;
  vi.unstubAllGlobals();
});

describe("loadResidentVrmMeta", () => {
  it("retourne null sans metadata", async () => {
    expect(await loadResidentVrmMeta()).toBeNull();
  });

  it("lit une metadata valide (hash optionnel)", async () => {
    memoryData.set(
      RESIDENT_VRM_META_KEY,
      JSON.stringify({ fileName: "Avatar_01.vrm", hash: "abc" })
    );
    expect(await loadResidentVrmMeta()).toEqual({
      fileName: "Avatar_01.vrm",
      hash: "abc",
    });
    memoryData.set(
      RESIDENT_VRM_META_KEY,
      JSON.stringify({ fileName: "Avatar_01.vrm" })
    );
    expect(await loadResidentVrmMeta()).toEqual({
      fileName: "Avatar_01.vrm",
      hash: null,
    });
  });

  it("refuse une metadata corrompue ou mal typee (absent, pas crash)", async () => {
    memoryData.set(RESIDENT_VRM_META_KEY, "{pas du json");
    expect(await loadResidentVrmMeta()).toBeNull();
    memoryData.set(RESIDENT_VRM_META_KEY, JSON.stringify({ hash: "abc" }));
    expect(await loadResidentVrmMeta()).toBeNull();
    memoryData.set(RESIDENT_VRM_META_KEY, JSON.stringify({ fileName: 42 }));
    expect(await loadResidentVrmMeta()).toBeNull();
  });
});

describe("loadResidentVrm", () => {
  it("absent (pas de metadata) : le preview retombe sur le bundle", async () => {
    expect(await loadResidentVrm()).toEqual({
      status: "none",
      reason: "absent",
    });
  });

  it("resident au nom du bundle : le bundle est prefere (perfs)", async () => {
    memoryData.set(
      RESIDENT_VRM_META_KEY,
      JSON.stringify({ fileName: BUNDLED_VRM_FILE_NAME, hash: null })
    );
    expect(await loadResidentVrm()).toEqual({
      status: "none",
      reason: "builtin-named",
    });
  });

  it("resident valide : buffer pret, fileName expose", async () => {
    memoryData.set(
      RESIDENT_VRM_META_KEY,
      JSON.stringify({ fileName: "Avatar_01.vrm", hash: null })
    );
    mockFetchWith(makeGlbBuffer());

    const result = await loadResidentVrm();

    expect(result.status).toBe("resident");
    if (result.status === "resident") {
      expect(new Uint8Array(result.buffer).length).toBe(16);
      expect(result.fileName).toBe("Avatar_01.vrm");
    }
  });

  it("magic invalide (residu non-GLB) : invalid + message, jamais crash", async () => {
    memoryData.set(
      RESIDENT_VRM_META_KEY,
      JSON.stringify({ fileName: "Avatar_01.vrm", hash: null })
    );
    // Page HTML d'erreur du serveur : n'est PAS un conteneur GLB.
    const html = new TextEncoder().encode("<html>Not Found</html>").buffer;
    mockFetchWith(html);

    const result = await loadResidentVrm();

    expect(result.status).toBe("invalid");
    if (result.status === "invalid") {
      expect(result.message).toMatch(/modèle intégré/);
    }
  });

  it("fichier manquant/illisible : invalid + message affichable", async () => {
    memoryData.set(
      RESIDENT_VRM_META_KEY,
      JSON.stringify({ fileName: "Avatar_01.vrm", hash: null })
    );
    mockFetchWith(null);

    const result = await loadResidentVrm();

    expect(result.status).toBe("invalid");
    if (result.status === "invalid") {
      expect(result.message).toMatch(/modèle intégré/);
    }
  });
});

describe("version du resident (rechargement preview)", () => {
  it("save et clear incrementent la version", async () => {
    const before = useResidentVrmStore.getState().version;
    await saveResidentVrmMeta({ fileName: "Avatar_01.vrm", hash: null });
    expect(useResidentVrmStore.getState().version).toBe(before + 1);

    await clearResidentVrm();
    expect(useResidentVrmStore.getState().version).toBe(before + 2);
    expect(memoryData.has(RESIDENT_VRM_META_KEY)).toBe(false);
    expect(deletedFiles).toContain("file:///docs/liteforms-resident.vrm");
  });

  it("clearResidentVrm sans fichier : idempotent, jamais crash", async () => {
    await expect(clearResidentVrm()).resolves.toBeUndefined();
    expect(memoryData.has(RESIDENT_VRM_META_KEY)).toBe(false);
  });
});

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

/** FileSystem mocke : documentDirectory fixe, deleteAsync journalise,
 * readAsStringAsync sert des fichiers base64 portes en memoire. */
const deletedFiles: string[] = [];
/** URI -> contenu base64 (null = fichier absent => readAsStringAsync lève). */
const residentFiles = new Map<string, string | null>();
vi.mock("expo-file-system/legacy", () => ({
  documentDirectory: "file:///docs/",
  EncodingType: { Base64: "base64" },
  deleteAsync: vi.fn(async (uri: string) => void deletedFiles.push(uri)),
  readAsStringAsync: vi.fn(async (uri: string) => {
    const content = residentFiles.get(uri);
    if (content === null || content === undefined) {
      throw new Error(`fichier introuvable : ${uri}`);
    }
    return content;
  }),
}));

/** isGlbBuffer re-implemente au test (magic 4 octets "glTF"). */
vi.mock("../avatar/nativeTextureSupport", () => ({
  isGlbBuffer: (buffer: ArrayBuffer): boolean => {
    const header = new Uint8Array(buffer, 0, 4);
    return String.fromCharCode(...header) === "glTF";
  },
}));

import { toBase64 } from "./base64.test";
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

/** Installe le fichier resident (base64) ou le rend illisible (null). */
function mockFileWith(buffer: ArrayBuffer | null): void {
  const fileUri = "file:///docs/liteforms-resident.vrm";
  if (buffer === null) {
    residentFiles.delete(fileUri);
  } else {
    residentFiles.set(fileUri, toBase64(new Uint8Array(buffer)));
  }
}

beforeEach(() => {
  memoryData.clear();
  deletedFiles.length = 0;
  residentFiles.clear();
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
    mockFileWith(makeGlbBuffer());

    const result = await loadResidentVrm();

    expect(result.status).toBe("resident");
    if (result.status === "resident") {
      expect(new Uint8Array(result.buffer).length).toBe(16);
      expect(result.fileName).toBe("Avatar_01.vrm");
    }
  });

  it("magic invalide (residu non-GLB) : invalid + message diagnostique, jamais crash", async () => {
    memoryData.set(
      RESIDENT_VRM_META_KEY,
      JSON.stringify({ fileName: "Avatar_01.vrm", hash: null })
    );
    // Page HTML d'erreur du serveur : n'est PAS un conteneur GLB.
    const html = new TextEncoder().encode("<html>Not Found</html>").buffer;
    mockFileWith(html);

    const result = await loadResidentVrm();

    expect(result.status).toBe("invalid");
    if (result.status === "invalid") {
      expect(result.message).toMatch(/modèle intégré/);
      // Diagnostic enrichi : taille lue + 4 premiers octets ASCII.
      expect(result.message).toMatch(/22 octets lus, début « <htm »/);
    }
  });

  it("fichier manquant : invalid + message affichable (0 octets, cause lisible)", async () => {
    memoryData.set(
      RESIDENT_VRM_META_KEY,
      JSON.stringify({ fileName: "Avatar_01.vrm", hash: null })
    );
    mockFileWith(null);

    const result = await loadResidentVrm();

    expect(result.status).toBe("invalid");
    if (result.status === "invalid") {
      expect(result.message).toMatch(/modèle intégré/);
      expect(result.message).toMatch(/0 octets lus/);
      expect(result.message).toMatch(/fichier introuvable/);
    }
  });

  it("fichier vide (base64 \"\") : invalid, 0 octets lus, pas de début", async () => {
    memoryData.set(
      RESIDENT_VRM_META_KEY,
      JSON.stringify({ fileName: "Avatar_01.vrm", hash: null })
    );
    residentFiles.set("file:///docs/liteforms-resident.vrm", "");

    expect((await loadResidentVrm()).status).toBe("invalid");
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

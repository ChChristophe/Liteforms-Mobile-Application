import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Tests du telechargement d'animation VRMA (apercu local) :
 * - garde path traversal : le `fileName` doit appartenir au CATALOGUE avant
 *   toute URL ;
 * - ecriture atomique `.part` -> final (renommage) + metadata de cache ;
 * - progression throtlee (<= 10 callbacks UI) ;
 * - erreurs reseau/HTTP : resultat redige, jamais un rejet.
 */

(globalThis as { __DEV__?: boolean }).__DEV__ = false;

const fakeResumable = vi.fn();
vi.mock("expo-file-system/legacy", () => ({
  documentDirectory: "file:///docs/",
  deleteAsync: vi.fn(async () => undefined),
  moveAsync: vi.fn(async () => undefined),
  createDownloadResumable: (...args: unknown[]) => fakeResumable(...args),
}));

vi.mock("../storage/animationCache", () => ({
  animationFileUri: (fileName: string) =>
    `file:///docs/liteforms-animations/${fileName}`,
  animationPartUri: (fileName: string) =>
    `file:///docs/liteforms-animations/${fileName}.part`,
  ensureAnimationCacheDir: vi.fn(async () => true),
  saveAnimationCacheEntry: vi.fn(async () => undefined),
}));

import * as FileSystem from "expo-file-system/legacy";
import {
  ensureAnimationCacheDir,
  saveAnimationCacheEntry,
} from "../storage/animationCache";
import { startAnimationDownload } from "./animationDownload";

type ProgressCallback = (data: {
  totalBytesWritten: number;
  totalBytesExpectedToWrite: number;
}) => void;

/** Resumable fake pilotable par test. */
function makeResumable(options: {
  result?: unknown;
  throw?: unknown;
}): { downloadAsync: ReturnType<typeof vi.fn> } {
  const resumable = {
    downloadAsync: vi.fn(async () => {
      if (options.throw !== undefined) throw options.throw;
      return options.result;
    }),
  };
  fakeResumable.mockReturnValue(resumable);
  return resumable;
}

beforeEach(() => {
  fakeResumable.mockReset();
  vi.mocked(FileSystem.deleteAsync).mockClear();
  vi.mocked(FileSystem.moveAsync).mockClear();
  vi.mocked(ensureAnimationCacheDir).mockClear();
  vi.mocked(saveAnimationCacheEntry).mockClear();
});

describe("startAnimationDownload", () => {
  it("refuse un nom hors catalogue sans former d'URL ni toucher le disque", async () => {
    const result = await startAnimationDownload(
      "192.168.1.42",
      43178,
      "../evil.vrma"
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/catalogue/i);
    expect(fakeResumable).not.toHaveBeenCalled();
    expect(FileSystem.deleteAsync).not.toHaveBeenCalled();
  });

  it("telecharge vers le .part puis renomme atomiquement sur le cache", async () => {
    const resumable = makeResumable({
      result: {
        uri: "file:///docs/liteforms-animations/Greeting.vrma.part",
        status: 200,
      },
    });
    const task = startAnimationDownload(
      "192.168.1.42",
      43178,
      "Greeting.vrma"
    );
    // Le callback de progression est disponible des l'appel (resumable cree
    // synchronement) : simule un binaire de 2048 octets.
    const callback = fakeResumable.mock.calls[0]?.[3] as ProgressCallback;
    callback({ totalBytesWritten: 2048, totalBytesExpectedToWrite: 2048 });

    const result = await task;

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.fileUri).toBe(
        "file:///docs/liteforms-animations/Greeting.vrma"
      );
      expect(result.sizeBytes).toBe(2048);
    }
    const [url, partUri] = fakeResumable.mock.calls[0] as [string, string];
    expect(url).toBe("http://192.168.1.42:43178/animations/Greeting.vrma");
    expect(partUri).toBe(
      "file:///docs/liteforms-animations/Greeting.vrma.part"
    );
    expect(FileSystem.moveAsync).toHaveBeenCalledWith({
      from: partUri,
      to: "file:///docs/liteforms-animations/Greeting.vrma",
    });
    expect(saveAnimationCacheEntry).toHaveBeenCalledWith(
      "Greeting.vrma",
      2048
    );
    expect(resumable.downloadAsync).toHaveBeenCalled();
  });

  it("throtle la progression a un callback par palier de 10 %", () => {
    makeResumable({ result: { uri: "", status: 200 } });
    const progress = vi.fn();
    void startAnimationDownload(
      "192.168.1.42",
      43178,
      "Greeting.vrma",
      progress
    );
    const callback = fakeResumable.mock.calls[0]?.[3] as ProgressCallback;
    for (let written = 0; written <= 200_000; written += 1_000) {
      callback({ totalBytesWritten: written, totalBytesExpectedToWrite: 200_000 });
    }
    expect(progress).toHaveBeenCalledTimes(10);
    expect(progress).toHaveBeenNthCalledWith(10, 1);
  });

  it("HTTP 404 : resultat explicite, .part purgé, pas de renommage", async () => {
    makeResumable({ result: { uri: "", status: 404 } });
    const result = await startAnimationDownload(
      "192.168.1.42",
      43178,
      "Greeting.vrma"
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain("HTTP 404");
    expect(FileSystem.moveAsync).not.toHaveBeenCalled();
    expect(saveAnimationCacheEntry).not.toHaveBeenCalled();
  });

  it("echec reseau : .part purgé, resultat ok:false, pas de metadata", async () => {
    makeResumable({ throw: new TypeError("Network request failed") });
    const result = await startAnimationDownload(
      "192.168.1.42",
      43178,
      "Greeting.vrma"
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain("Network request failed");
    expect(FileSystem.moveAsync).not.toHaveBeenCalled();
    expect(saveAnimationCacheEntry).not.toHaveBeenCalled();
  });

  it("coordonnees invalides : echec sans appel reseau", async () => {
    const result = await startAnimationDownload(
      "desktop.local",
      43178,
      "Greeting.vrma"
    );
    expect(result.ok).toBe(false);
    expect(fakeResumable).not.toHaveBeenCalled();
  });
});

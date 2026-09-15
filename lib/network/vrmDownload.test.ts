import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Tests du telechargement VRM Desktop -> telephone (D2, 15/09/2026) :
 * - garde path traversal : le `fileName` est valide LOCALEMENT avant URL ;
 * - ecriture atomique `.part` → renommage resident (moveAsync) ;
 * - progression throtlee (>= 10 events -> <= 10 callbacks UI) ;
 * - erreurs reseau / HTTP / annulation : resultat redige, jamais un crash,
 *   jamais un modelRef mis a jour (pattern deviceClient, sans confiance).
 */

(globalThis as { __DEV__?: boolean }).__DEV__ = false;

const fakeResumable = vi.fn();
vi.mock("expo-file-system/legacy", () => ({
  documentDirectory: "file:///docs/",
  deleteAsync: vi.fn(async () => undefined),
  moveAsync: vi.fn(async () => undefined),
  createDownloadResumable: (...args: unknown[]) => fakeResumable(...args),
}));

vi.mock("../storage/residentVrm", () => ({
  residentVrmFileUri: () => "file:///docs/liteforms-resident.vrm",
  residentVrmPartUri: () => "file:///docs/liteforms-resident.vrm.part",
}));

import * as FileSystem from "expo-file-system/legacy";
import {
  startVrmDownload,
  VRM_FILE_NAME_PATTERN,
} from "./vrmDownload";

/** Resumable fake pilotable par test. */
function makeResumable(options: {
  result?: unknown;
  throw?: unknown;
}): { downloadAsync: ReturnType<typeof vi.fn>; cancelAsync: ReturnType<typeof vi.fn> } {
  const resumable = {
    downloadAsync: vi.fn(async () => {
      if (options.throw !== undefined) throw options.throw;
      return options.result;
    }),
    cancelAsync: vi.fn(async () => undefined),
  };
  fakeResumable.mockReturnValue(resumable);
  return resumable;
}

beforeEach(() => {
  fakeResumable.mockReset();
  vi.mocked(FileSystem.deleteAsync).mockClear();
  vi.mocked(FileSystem.moveAsync).mockClear();
});

describe("VRM_FILE_NAME_PATTERN (garde anti path traversal)", () => {
  it("accepte les noms du contrat serveur", () => {
    expect("lobsterEdit.vrm").toMatch(VRM_FILE_NAME_PATTERN);
    expect("Avatar_01.Final.vrm").toMatch(VRM_FILE_NAME_PATTERN);
  });

  it("refuse les traversées et les imitations", () => {
    expect("../../etc/passwd.vrm").not.toMatch(VRM_FILE_NAME_PATTERN);
    expect("a/b.vrm").not.toMatch(VRM_FILE_NAME_PATTERN);
    expect("\\windows\\evil.vrm").not.toMatch(VRM_FILE_NAME_PATTERN);
    expect(".hidden.vrm").not.toMatch(VRM_FILE_NAME_PATTERN);
    expect("a.vrm.txt").not.toMatch(VRM_FILE_NAME_PATTERN);
    expect("a?query.vrm").not.toMatch(VRM_FILE_NAME_PATTERN);
  });
});

describe("startVrmDownload", () => {
  it("refuse un nom hors contrat sans former d'URL ni toucher le disque", async () => {
    const task = startVrmDownload(
      "192.168.1.42",
      43178,
      "../evil.vrm"
    );
    const result = await task.promise;
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/invalide/i);
    expect(fakeResumable).not.toHaveBeenCalled();
    expect(FileSystem.deleteAsync).not.toHaveBeenCalled();
  });

  it("telecharge vers le .part, renomme atomiquement et rend le md5", async () => {
    const resumable = makeResumable({
      result: { uri: "file:///docs/liteforms-resident.vrm.part", status: 200, md5: "abc123" },
    });
    const progress = vi.fn();

    const task = startVrmDownload("192.168.1.42", 43178, "Avatar_01.vrm", progress);
    const result = await task.promise;

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.fileUri).toBe("file:///docs/liteforms-resident.vrm");
      expect(result.md5).toBe("abc123");
    }
    const [url, partUri, options] = fakeResumable.mock.calls[0] as unknown as [
      string,
      string,
      Record<string, unknown>,
    ];
    expect(url).toBe(
      "http://192.168.1.42:43178/api/device/vrms/file?name=Avatar_01.vrm"
    );
    expect(partUri).toBe("file:///docs/liteforms-resident.vrm.part");
    expect(options.md5).toBe(true);
    // Purge du .part eventuellement anterieur AVANT le telechargement.
    expect(FileSystem.deleteAsync).toHaveBeenCalledWith(partUri, {
      idempotent: true,
    });
    expect(FileSystem.moveAsync).toHaveBeenCalledWith({
      from: partUri,
      to: "file:///docs/liteforms-resident.vrm",
    });
    expect(resumable.downloadAsync).toHaveBeenCalled();
  });

  it("throtle la progression a un callback par palier de 10 %", () => {
    makeResumable({ result: { uri: "", status: 200, md5: null } });
    const progress = vi.fn();
    startVrmDownload("192.168.1.42", 43178, "Avatar_01.vrm", progress);
    const callback = fakeResumable.mock.calls.at(-1)?.[3] as (
      data: { totalBytesWritten: number; totalBytesExpectedToWrite: number }
    ) => void;
    // 200 events reguliers : le callback UI doit etre appele <= 10 fois.
    for (let written = 0; written <= 200_000; written += 1_000) {
      callback({ totalBytesWritten: written, totalBytesExpectedToWrite: 200_000 });
    }
    expect(progress).toHaveBeenCalledTimes(10);
    expect(progress).toHaveBeenNthCalledWith(10, 1);
  });

  it("signale le total inconnu (Content-Length absent) une seule fois", () => {
    const progress = vi.fn();
    makeResumable({ result: { uri: "", status: 200, md5: null } });
    startVrmDownload("192.168.1.42", 43178, "Avatar_01.vrm", progress);
    const callback = fakeResumable.mock.calls.at(-1)?.[3] as (
      data: { totalBytesWritten: number; totalBytesExpectedToWrite: number }
    ) => void;
    callback({ totalBytesWritten: 100, totalBytesExpectedToWrite: -1 });
    callback({ totalBytesWritten: 200, totalBytesExpectedToWrite: -1 });
    expect(progress).toHaveBeenCalledTimes(1);
    expect(progress).toHaveBeenCalledWith(null);
  });

  it("echec reseau : .part purgé, resultat ok:false, pas de renommage", async () => {
    const resumable = makeResumable({ throw: new TypeError("Network request failed") });

    const result = await startVrmDownload(
      "192.168.1.42",
      43178,
      "Avatar_01.vrm"
    ).promise;

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.cancelled).toBe(false);
      expect(result.error).toContain("Network request failed");
    }
    expect(FileSystem.moveAsync).not.toHaveBeenCalled();
    expect(resumable.downloadAsync).toHaveBeenCalledTimes(1);
  });

  it("HTTP 404 : resultat HTTP explicite, .part purgé, pas de renommage", async () => {
    makeResumable({ result: { uri: "", status: 404, md5: null } });

    const result = await startVrmDownload(
      "192.168.1.42",
      43178,
      "Absent.vrm"
    ).promise;

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain("HTTP 404");
    expect(FileSystem.moveAsync).not.toHaveBeenCalled();
  });

  it("annulation : resultat cancelled (non affichable), pas de modelRef", async () => {
    makeResumable({ result: undefined });

    const result = await startVrmDownload(
      "192.168.1.42",
      43178,
      "Avatar_01.vrm"
    ).promise;

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.cancelled).toBe(true);
    expect(FileSystem.moveAsync).not.toHaveBeenCalled();
  });

  it("cancel() annule la resumable et purge le .part", async () => {
    const resumable = makeResumable({ result: undefined });

    const task = startVrmDownload("192.168.1.42", 43178, "Avatar_01.vrm");
    await task.cancel();

    expect(resumable.cancelAsync).toHaveBeenCalledTimes(1);
    expect(FileSystem.deleteAsync).toHaveBeenCalledWith(
      "file:///docs/liteforms-resident.vrm.part",
      { idempotent: true }
    );
  });

  it("coordonnees invalides : echec sans appel reseau", async () => {
    const result = await startVrmDownload(
      "desktop.local",
      43178,
      "Avatar_01.vrm"
    ).promise;
    expect(result.ok).toBe(false);
    expect(fakeResumable).not.toHaveBeenCalled();
  });
});

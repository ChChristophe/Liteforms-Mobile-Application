import { beforeEach, describe, expect, it, vi } from "vitest";
import * as THREE from "three";
import {
  TARGET_VRM_HEIGHT,
  measureVrmStandingHeight,
  normalizeVrmHeight,
  resolveTargetVrmHeight,
  resetVrmCalibration,
} from "./previewRuntime";

/**
 * Protege l'invariant de cadrage 15/09 : tout VRM, quelle que soit sa bbox
 * d'origine (grand, petit, bras ecartes), ressort a la hauteur cible —
 * reference = hauteur native du bundle lobster (voir resolveTargetVrmHeight).
 */
function makeHumanoid(height: number, armSpan?: number): THREE.Group {
  const group = new THREE.Group();
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.2, height, 0.2));
  body.position.y = height / 2; // pieds a y=0
  group.add(body);
  if (armSpan !== undefined) {
    const arms = new THREE.Mesh(new THREE.BoxGeometry(armSpan, 0.1, 0.1));
    arms.position.y = height * 0.8;
    group.add(arms);
  }
  return group;
}

function bboxHeight(scene: THREE.Object3D): number {
  return new THREE.Box3().setFromObject(scene).getSize(new THREE.Vector3()).y;
}

describe("normalizeVrmHeight", () => {
  it("normalise n'importe quelle hauteur d'origine a TARGET_VRM_HEIGHT", () => {
    for (const original of [0.3, 1.0, 1.8, 5, 40]) {
      const scene = makeHumanoid(original);
      normalizeVrmHeight(scene, TARGET_VRM_HEIGHT);
      expect(bboxHeight(scene)).toBeCloseTo(TARGET_VRM_HEIGHT, 5);
    }
  });

  it("un VRM aux bras ecartes garde sa pleine hauteur (mesure sur Y, pas max axe)", () => {
    const wide = makeHumanoid(1.6, 3.5); // bras >> hauteur
    normalizeVrmHeight(wide, TARGET_VRM_HEIGHT);
    expect(bboxHeight(wide)).toBeCloseTo(TARGET_VRM_HEIGHT, 5);
  });

  it("est idempotent", () => {
    const scene = makeHumanoid(1.8);
    normalizeVrmHeight(scene, TARGET_VRM_HEIGHT);
    const afterFirst = scene.scale.x;
    normalizeVrmHeight(scene, TARGET_VRM_HEIGHT);
    expect(scene.scale.x).toBeCloseTo(afterFirst, 6);
    expect(bboxHeight(scene)).toBeCloseTo(TARGET_VRM_HEIGHT, 5);
  });

  it("cadrage : fillDistance constant pour deux VRM de bboxes differentes", () => {
    const fovRad = (30 * Math.PI) / 360;
    const fill = (h: number) =>
      h / 2 / Math.tan(fovRad) * 1.45 + 0.05;
    const a = makeHumanoid(0.9, 1.5);
    const b = makeHumanoid(2.4, 2.0);
    normalizeVrmHeight(a, TARGET_VRM_HEIGHT);
    normalizeVrmHeight(b, TARGET_VRM_HEIGHT);
    const heightA = bboxHeight(a);
    const heightB = bboxHeight(b);
    expect(heightA).toBeCloseTo(heightB, 5);
    expect(fill(heightA)).toBeCloseTo(fill(heightB), 8);
  });

  it("edge : bbox vide, hauteur nulle ou cible <= 0 => no-op sans crash", () => {
    const empty = new THREE.Group();
    expect(() => normalizeVrmHeight(empty, TARGET_VRM_HEIGHT)).not.toThrow();
    expect(empty.scale.x).toBe(1);

    const flat = makeHumanoid(0.001);
    flat.children[0].position.y = 0; // bbox plate
    expect(() => normalizeVrmHeight(flat, 0)).not.toThrow();
    expect(() => normalizeVrmHeight(flat, -1)).not.toThrow();
  });
});

/**
 * Calibration de la cible (incident 15/09 v2) : le ratio alcove/avatar doit
 * etre celui du cadrage d'origine du lobster. La cible n'est plus la
 * constante 1.0 mais la hauteur native mesuree du bundle lobster ; le
 * lobster affiche n'est JAMAIS rescale (scale cible/natif = 1). Un buffer
 * bundle illisible retombe proprement sur le fallback historique 1.0.
 */
describe("resolveTargetVrmHeight (calibration sur le bundle lobster)", () => {
  const BUNDLE = new ArrayBuffer(8);
  type ParseMock = (buffer: ArrayBuffer) => Promise<{
    scene: THREE.Object3D;
    vrm: null;
  }>;

  const parseMock = (height: number | null, error?: Error): ParseMock =>
    vi.fn(async () => {
      if (error) throw error;
      return { scene: makeHumanoid(height ?? 0), vrm: null };
    });

  beforeEach(() => {
    resetVrmCalibration();
  });

  it("bundle affiche : la hauteur native mesuree devient la cible (echelle 1, jamais rescale)", async () => {
    await expect(
      resolveTargetVrmHeight({ isBundledVrm: true, nativeHeight: 1.83 })
    ).resolves.toBe(1.83);
    // La cible est cachee pour les residents suivants.
    await expect(
      resolveTargetVrmHeight({ isBundledVrm: false })
    ).resolves.toBe(1.83);
  });

  it("resident affiche, cache vide : cible mesuree depuis le buffer bundle mocke", async () => {
    const parse = parseMock(1.83);
    await expect(
      resolveTargetVrmHeight({ isBundledVrm: false, bundledVrm: BUNDLE, parse })
    ).resolves.toBeCloseTo(1.83, 5);
    // mesure faite UNE fois : appel suivant servi par le cache.
    await expect(
      resolveTargetVrmHeight({ isBundledVrm: false })
    ).resolves.toBeCloseTo(1.83, 5);
    expect(parse).toHaveBeenCalledTimes(1);
  });

  it("edge : buffer bundle invalide (parse jette) => fallback historique 1.0, cache non pollue", async () => {
    const parse = parseMock(null, new Error("conteneur GLB invalide"));
    await expect(
      resolveTargetVrmHeight({ isBundledVrm: false, bundledVrm: BUNDLE, parse })
    ).resolves.toBe(TARGET_VRM_HEIGHT);
    expect(TARGET_VRM_HEIGHT).toBe(1.0);
    // aucune cible en cache : la mesure est re tentee au prochain reload.
    await expect(
      resolveTargetVrmHeight({ isBundledVrm: false })
    ).resolves.toBe(TARGET_VRM_HEIGHT);
  });

  it("edge : buffer illisible (hauteur nulle) => fallback 1.0", async () => {
    await expect(
      resolveTargetVrmHeight({
        isBundledVrm: false,
        bundledVrm: BUNDLE,
        parse: parseMock(null),
      })
    ).resolves.toBe(TARGET_VRM_HEIGHT);
  });
});

describe("measureVrmStandingHeight", () => {
  beforeEach(() => {
    resetVrmCalibration();
  });

  it("mesure la HAUTEUR debout (Y) apres correction VRM0, bras ecartes compris", async () => {
    const scene = makeHumanoid(1.62, 3.0);
    const height = await measureVrmStandingHeight(
      new ArrayBuffer(8),
      async () => ({ scene, vrm: null })
    );
    expect(height).toBeCloseTo(1.62, 5);
  });

  it("edge : parse en echec ou bbox degeneresce => null (l'appelant garde le fallback)", async () => {
    await expect(
      measureVrmStandingHeight(new ArrayBuffer(8), async () => {
        throw new Error("buffers GLB invalides");
      })
    ).resolves.toBeNull();

    const flat = new THREE.Group();
    await expect(
      measureVrmStandingHeight(new ArrayBuffer(8), async () => ({
        scene: flat,
        vrm: null,
      }))
    ).resolves.toBeNull();
  });
});

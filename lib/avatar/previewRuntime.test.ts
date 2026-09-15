import { beforeEach, describe, expect, it, vi } from "vitest";
import * as THREE from "three";
import {
  CAM_FILL_DISTANCE_FACTOR,
  TARGET_VRM_HEIGHT,
  measureVrmBaseline,
  normalizeVrmHeight,
  resolveBaselineHalfMaxDim,
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

describe("measureVrmBaseline (baseline camera, incident 15/09 v3)", () => {
  beforeEach(() => {
    resetVrmCalibration();
  });

  it("mesure hauteur ET demi-max-dimension apres correction VRM0 (bras ecartes -> axe X)", async () => {
    const scene = makeHumanoid(1.62, 3.0);
    const baseline = await measureVrmBaseline(
      new ArrayBuffer(8),
      async () => ({ scene, vrm: null })
    );
    expect(baseline?.height).toBeCloseTo(1.62, 5);
    expect(baseline?.halfMaxDim).toBeCloseTo(1.5, 5);
  });

  it("edge : parse en echec ou bbox degeneresce => null (l'appelant garde le fallback)", async () => {
    await expect(
      measureVrmBaseline(new ArrayBuffer(8), async () => {
        throw new Error("buffers GLB invalides");
      })
    ).resolves.toBeNull();

    const flat = new THREE.Group();
    await expect(
      measureVrmBaseline(new ArrayBuffer(8), async () => ({
        scene: flat,
        vrm: null,
      }))
    ).resolves.toBeNull();
  });
});

/**
 * Incident 15/09 v3 : la DISTANCE camera ne doit dependre d'aucune mesure du
 * VRM affiche. Elle derive uniquement de la baseline lobster (cachee une
 * fois par session) : bras ecartes ou silhouette fine => meme cadrage.
 */
describe("resolveTargetVrmHeight : baseline camera figee sur le lobster", () => {
  const BUNDLE = new ArrayBuffer(8);
  type ParseMock = (buffer: ArrayBuffer) => Promise<{
    scene: THREE.Object3D;
    vrm: null;
  }>;

  const parseMock = (
    height: number | null,
    armSpan?: number,
    error?: Error
  ): ParseMock =>
    vi.fn(async () => {
      if (error) throw error;
      return { scene: makeHumanoid(height ?? 0, armSpan), vrm: null };
    });

  /** Formule de cadrage du runtime, appliquee a la baseline ONLY. */
  const fillDistance = (halfMaxDim: number) =>
    halfMaxDim / Math.tan((30 * Math.PI) / 360);

  beforeEach(() => {
    resetVrmCalibration();
  });

  it("bundle affiche : baseline complete cachee, width X comprise", async () => {
    await expect(
      resolveTargetVrmHeight({
        isBundledVrm: true,
        nativeHeight: 1.83,
        nativeHalfMaxDim: 0.95,
      })
    ).resolves.toBe(1.83);
    // La baseline entiere est cachee pour les residents suivants.
    await expect(
      resolveTargetVrmHeight({ isBundledVrm: false })
    ).resolves.toBe(1.83);
    expect(resolveBaselineHalfMaxDim()).toBe(0.95);
  });

  it("BASE_FILL_DISTANCE calculee UNE fois (mock buffer), puis servie par le cache", async () => {
    const parse = parseMock(1.83, 2.0); // lobster aux bras ecartes
    await expect(
      resolveTargetVrmHeight({ isBundledVrm: false, bundledVrm: BUNDLE, parse })
    ).resolves.toBeCloseTo(1.83, 5);
    await expect(
      resolveTargetVrmHeight({ isBundledVrm: false })
    ).resolves.toBeCloseTo(1.83, 5);
    expect(parse).toHaveBeenCalledTimes(1);
    // fillDistance figee sur le max-dim du lobster (bras inclus).
    expect(resolveBaselineHalfMaxDim()).toBeCloseTo(1.0, 5);
    expect(fillDistance(resolveBaselineHalfMaxDim())).toBeCloseTo(
      fillDistance(1.0),
      10
    );
  });

  it("fillDistance INDEPENDANT du X de la bbox affichee : bras ecartes vs fin => même distance", () => {
    // L'ANCIENNE formule (maxDimension du VRM affiche) divergeait — c'etait
    // le bug 15/09 v3 : un VRM aux bras ecartes etait dezoomé.
    const oldFill = (maxDim: number) =>
      maxDim / 2 / Math.tan((30 * Math.PI) / 360);
    expect(oldFill(4.0)).not.toBeCloseTo(oldFill(0.2), 5);
    // La NOUVELLE distance ne croise que la baseline lobster (cachee) :
    // constante, donc identique quel que soit le VRM affiche.
    const baselineFillDistance = oldFill(resolveBaselineHalfMaxDim());
    expect(baselineFillDistance).toBeCloseTo(oldFill(0.5), 10);
  });

  it("lobster = cadrage d'origine : formule baseline == ancienne formule maxDimension", async () => {
    const oldFormulaFill = (maxDim: number) =>
      maxDim / 2 / Math.tan((30 * Math.PI) / 360);
    await resolveTargetVrmHeight({
      isBundledVrm: false,
      bundledVrm: BUNDLE,
      parse: parseMock(1.8, 1.6),
    });
    // Ancien code : fillDistance = maxDim/2 / tan(halfFov), maxDim = max(X,Y,Z)
    // de la bbox (ici Y=1.8 > X=1.6). Nouveau : halfMaxDim = maxDim/2 ->
    // identique pour le lobster (jamais rescale).
    expect(fillDistance(resolveBaselineHalfMaxDim())).toBeCloseTo(
      oldFormulaFill(1.8),
      5
    );
  });

  it("edge : buffer bundle invalide (parse jette) => fallback historique 1.0, baseline 0.5, cache non pollue", async () => {
    const parse = parseMock(null, undefined, new Error("conteneur GLB invalide"));
    await expect(
      resolveTargetVrmHeight({ isBundledVrm: false, bundledVrm: BUNDLE, parse })
    ).resolves.toBe(TARGET_VRM_HEIGHT);
    expect(TARGET_VRM_HEIGHT).toBe(1.0);
    expect(resolveBaselineHalfMaxDim()).toBe(0.5);
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

  it("le facteur de recul est bien 1.45 (cadrage d'origine preserve)", () => {
    expect(CAM_FILL_DISTANCE_FACTOR).toBe(1.45);
  });
});

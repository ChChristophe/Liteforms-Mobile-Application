import { beforeEach, describe, expect, it, vi } from "vitest";
import * as THREE from "three";
import {
  CAM_FILL_DISTANCE_FACTOR,
  TARGET_VRM_HEIGHT,
  measureVrmBaseline,
  normalizeVrmHeight,
  resetVrmCalibration,
  resolveVrmBaseline,
  type VrmBaseline,
} from "./previewRuntime";

/**
 * Protege l'invariant de cadrage 15/09 (v4) : tout VRM, quelle que soit sa
 * bbox d'origine (grand, petit, bras ecartes, pivot decale), est normalise
 * a la hauteur du lobster PUIS aligne sur son centre. La camera et l'alcove
 * ne lisent plus AUCUNE mesure du VRM affiche : zoom et calage constants.
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
  it("normalise n'importe quelle hauteur d'origine a la cible", () => {
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

describe("measureVrmBaseline (boite complete du lobster)", () => {
  it("mesure hauteur, demi-max-dim, centre ET pieds (bras ecartes -> axe X)", async () => {
    const scene = makeHumanoid(1.62, 3.0);
    const baseline = await measureVrmBaseline(
      new ArrayBuffer(8),
      async () => ({ scene, vrm: null })
    );
    expect(baseline?.height).toBeCloseTo(1.62, 5);
    expect(baseline?.halfMaxDim).toBeCloseTo(1.5, 5);
    expect(baseline?.center.y).toBeCloseTo(0.81, 5);
    expect(baseline?.minY).toBeCloseTo(0, 5);
  });

  it("edge : parse en echec ou bbox degeneresce => null", async () => {
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

describe("resolveVrmBaseline (calibration cachee une fois par session)", () => {
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

  const lobsterBaseline = (height = 1.83, armSpan = 2.0): VrmBaseline => ({
    height,
    halfMaxDim: Math.max(height, armSpan) / 2,
    center: { x: 0, y: height / 2, z: 0 },
    minY: 0,
  });

  beforeEach(() => {
    resetVrmCalibration();
  });

  it("bundle affiche : sa baseline native devient la reference et est cachee", async () => {
    const native = lobsterBaseline();
    await expect(
      resolveVrmBaseline({ isBundledVrm: true, nativeBaseline: native })
    ).resolves.toEqual(native);
    // Les residents suivants heritent de cette meme reference.
    await expect(
      resolveVrmBaseline({ isBundledVrm: false })
    ).resolves.toEqual(native);
  });

  it("resident affiche, cache vide : baseline mesuree depuis le buffer bundle mocke, UNE fois", async () => {
    const parse = parseMock(1.83, 2.0);
    const first = await resolveVrmBaseline({
      isBundledVrm: false,
      bundledVrm: BUNDLE,
      parse,
    });
    expect(first.height).toBeCloseTo(1.83, 5);
    expect(first.halfMaxDim).toBeCloseTo(1.0, 5);
    const second = await resolveVrmBaseline({ isBundledVrm: false });
    expect(second).toEqual(first);
    expect(parse).toHaveBeenCalledTimes(1);
  });

  it("edge : buffer bundle invalide => fallback constant, cache non pollue", async () => {
    const parse = parseMock(null, undefined, new Error("conteneur GLB invalide"));
    const result = await resolveVrmBaseline({
      isBundledVrm: false,
      bundledVrm: BUNDLE,
      parse,
    });
    expect(result.height).toBe(TARGET_VRM_HEIGHT);
    expect(result.halfMaxDim).toBe(TARGET_VRM_HEIGHT / 2);
    // Retentee au prochain appel (cache toujours vide).
    expect(
      (await resolveVrmBaseline({ isBundledVrm: false })).height
    ).toBe(TARGET_VRM_HEIGHT);
  });

  it("edge : buffer illisible (hauteur nulle) => fallback constant", async () => {
    const result = await resolveVrmBaseline({
      isBundledVrm: false,
      bundledVrm: BUNDLE,
      parse: parseMock(null),
    });
    expect(result.height).toBe(TARGET_VRM_HEIGHT);
  });

  it("la reference est INDEPENDANTE du VRM affiche (invariant v4)", async () => {
    const native = lobsterBaseline(1.83, 2.0);
    await resolveVrmBaseline({ isBundledVrm: true, nativeBaseline: native });
    // Un resident quelconque (bras ecartes, autre hauteur) : la baseline
    // retournee reste celle du lobster — aucune mesure du resident.
    const resident = await resolveVrmBaseline({ isBundledVrm: false });
    expect(resident).toEqual(native);
  });

  it("le facteur de recul est bien 1.45 (cadrage d'origine preserve)", () => {
    expect(CAM_FILL_DISTANCE_FACTOR).toBe(1.45);
  });
});

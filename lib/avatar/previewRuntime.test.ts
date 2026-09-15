import { beforeEach, describe, expect, it, vi } from "vitest";
import * as THREE from "three";
import {
  CAM_FILL_DISTANCE_FACTOR,
  IMPORTED_HEIGHT_FILL,
  IMPORTED_WIDTH_FILL,
  TARGET_VRM_HEIGHT,
  computeFootprintScale,
  measureVrmBaseline,
  resetVrmCalibration,
  resolveVrmBaseline,
  type VrmBaseline,
} from "./previewRuntime";

/**
 * Protege l'invariant de cadrage 15/09 (v5) : reproduction du cadrage par
 * empreinte du /hologram Desktop. Un VRM est mis a l'echelle UNIFORME pour
 * tenir dans l'empreinte du lobster (inseree 0.9/0.82) — proportions natives
 * preservees (large/plat reste plat, petit reste petit). Le lobster n'est
 * JAMAIS rescale (reference). La camera et l'alcove ne dependent d'aucune
 * mesure du modele affiche.
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

function bboxSize(scene: THREE.Object3D): THREE.Vector3 {
  return new THREE.Box3().setFromObject(scene).getSize(new THREE.Vector3());
}

describe("computeFootprintScale (cadrage par empreinte)", () => {
  it("un modele deja dans l'empreinte est agrandi jusqu'a la toucher", () => {
    // reference (lobster) 1.0 x 1.6 ; modele petit 0.5 x 0.5.
    const scale = computeFootprintScale(0.5, 0.5, 1.0, 1.6);
    // largeur : 0.9/0.5 = 1.8 ; hauteur : (1.6*0.82)/0.5 = 2.624 -> min 1.8
    expect(scale).toBeCloseTo((1.0 * IMPORTED_WIDTH_FILL) / 0.5, 6);
  });

  it("un modele large/plat est contraint par la LARGEUR (reste plat)", () => {
    // lilshark-like : tres large, tres plat.
    const scale = computeFootprintScale(2.5, 0.4, 1.0, 1.6);
    expect(scale).toBeCloseTo((1.0 * IMPORTED_WIDTH_FILL) / 2.5, 6);
    // La hauteur resultante est donc petite (proportions preservees).
    expect(0.4 * scale).toBeLessThan(1.6 * IMPORTED_HEIGHT_FILL);
  });

  it("un modele grand est reduit pour tenir dans l'empreinte", () => {
    const scale = computeFootprintScale(4.0, 5.0, 1.0, 1.6);
    expect(scale).toBeLessThan(1);
    // contraint par la LARGEUR (ratio le plus petit : 0.9/4 < (1.6*0.82)/5).
    expect(scale).toBeCloseTo((1.0 * IMPORTED_WIDTH_FILL) / 4.0, 6);
  });

  it("edge : dimensions nulles => scale 1 (pas de crash ni infini)", () => {
    expect(computeFootprintScale(0, 0, 1.0, 1.6)).toBe(1);
    expect(computeFootprintScale(0, 1.0, 1.0, 1.6)).toBe(1);
  });
});

describe("measureVrmBaseline (boite complete du lobster)", () => {
  it("mesure hauteur, largeur, demi-max-dim, centre ET pieds", async () => {
    const scene = makeHumanoid(1.62, 3.0);
    const baseline = await measureVrmBaseline(
      new ArrayBuffer(8),
      async () => ({ scene, vrm: null })
    );
    expect(baseline?.height).toBeCloseTo(1.62, 5);
    expect(baseline?.width).toBeCloseTo(3.0, 5);
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
    width: armSpan,
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

  it("la reference est INDEPENDANTE du VRM affiche (invariant v5)", async () => {
    const native = lobsterBaseline(1.83, 2.0);
    await resolveVrmBaseline({ isBundledVrm: true, nativeBaseline: native });
    const resident = await resolveVrmBaseline({ isBundledVrm: false });
    expect(resident).toEqual(native);
  });

  it("le facteur de recul est bien 1.45 (cadrage d'origine preserve)", () => {
    expect(CAM_FILL_DISTANCE_FACTOR).toBe(1.45);
  });
});

import { beforeEach, describe, expect, it, vi } from "vitest";
import * as THREE from "three";
import {
  CAM_FILL_DISTANCE_FACTOR,
  REF_MAX_AXIS,
  measureLobsterReference,
  resetVrmCalibration,
  resolveLobsterReference,
  type LobsterReference,
} from "./previewRuntime";

/**
 * Protege l'invariant de cadrage 15/09 (v6) : reproduction FIDELE du cadrage
 * du /hologram Desktop (`modelFraming.ts` + `applyMeasuredFraming`). Le
 * lobster est cadre a `maxAxis = REF_MAX_AXIS` ; les modeles importes sont
 * cadres dans l'empreinte de ce lobster (inseree). Les proportions natives
 * sont preservees, l'alcove suit l'echelle/position du modele, camera fixe.
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

type ParseMock = (buffer: ArrayBuffer) => Promise<{
  scene: THREE.Object3D;
  vrm: null;
}>;

const parseMock = (
  height: number,
  armSpan?: number,
  error?: Error
): ParseMock =>
  vi.fn(async () => {
    if (error) throw error;
    return { scene: makeHumanoid(height, armSpan), vrm: null };
  });

describe("measureLobsterReference (cadre le lobster a maxAxis)", () => {
  it("mesure l'empreinte et le bas du lobster cadre", async () => {
    // lobster : hauteur 1.8 (maxAxis = hauteur), bras 1.2.
    const reference = await measureLobsterReference(
      new ArrayBuffer(8),
      async () => ({ scene: makeHumanoid(1.8, 1.2), vrm: null })
    );
    expect(reference?.footprint.height).toBeCloseTo(1.8, 4);
    expect(reference?.boundsBottom).toBeCloseTo(-0.05, 4);
  });

  it("edge : parse en echec => null", async () => {
    await expect(
      measureLobsterReference(new ArrayBuffer(8), async () => {
        throw new Error("conteneur GLB invalide");
      })
    ).resolves.toBeNull();
  });
});

describe("resolveLobsterReference (cache une fois par session)", () => {
  const BUNDLE = new ArrayBuffer(8);
  const reference = (): LobsterReference => ({
    footprint: { width: 1.8, height: 1.8 },
    boundsBottom: -0.05,
    environmentScale: new THREE.Vector3(1, 1, 1),
    environmentPosition: new THREE.Vector3(),
  });

  beforeEach(() => {
    resetVrmCalibration();
  });

  it("lobster affiche : sa reference devient le cache", async () => {
    const native = reference();
    await expect(
      resolveLobsterReference({ isLobster: true, nativeReference: native })
    ).resolves.toEqual(native);
    await expect(
      resolveLobsterReference({ isLobster: false })
    ).resolves.toEqual(native);
  });

  it("resident affiche, cache vide : mesure du buffer bundle, UNE fois", async () => {
    const parse = parseMock(1.8, 1.2);
    const first = await resolveLobsterReference({
      isLobster: false,
      bundledVrm: BUNDLE,
      parse,
    });
    expect(first.footprint.height).toBeCloseTo(1.8, 4);
    const second = await resolveLobsterReference({ isLobster: false });
    expect(second).toEqual(first);
    expect(parse).toHaveBeenCalledTimes(1);
  });

  it("edge : buffer bundle invalide => fallback constant, cache non pollue", async () => {
    const parse = parseMock(0, undefined, new Error("invalide"));
    const result = await resolveLobsterReference({
      isLobster: false,
      bundledVrm: BUNDLE,
      parse,
    });
    expect(result.footprint).toEqual({ width: REF_MAX_AXIS, height: REF_MAX_AXIS });
    expect(
      (await resolveLobsterReference({ isLobster: false })).boundsBottom
    ).toBe(-0.05);
  });

  it("la reference est INDEPENDANTE du VRM affiche (invariant v6)", async () => {
    const native = reference();
    await resolveLobsterReference({ isLobster: true, nativeReference: native });
    expect(await resolveLobsterReference({ isLobster: false })).toEqual(native);
  });

  it("le facteur de recul est 1.2 (alcove plus grosse sur ecran portrait)", () => {
    expect(CAM_FILL_DISTANCE_FACTOR).toBe(1.2);
  });
});

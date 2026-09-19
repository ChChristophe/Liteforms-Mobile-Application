import { describe, expect, it, vi } from "vitest";
import {
  AnimationClip,
  QuaternionKeyframeTrack,
  VectorKeyframeTrack,
} from "three";
import type { VRM } from "@pixiv/three-vrm";
import { recenterHipsTranslation } from "./vrmAnimationClip";

/**
 * Protege le correctif de derive laterale de l'idle VRMA (portage Web
 * `050c195`) : la moyenne X/Z de la piste de position des hips est soustraite,
 * Y et sway sont conserves, les autres pistes et les cas sans cible restent
 * intacts.
 */
function makeHipsVrm(hipsName: string | null): VRM {
  return {
    humanoid: {
      getNormalizedBoneNode: vi.fn((boneName: string) =>
        boneName === "hips" && hipsName !== null ? { name: hipsName } : null
      ),
    },
  } as unknown as VRM;
}

function meanOf(values: ArrayLike<number>, offset: number, stride: number): number {
  let sum = 0;
  let count = 0;
  for (let index = offset; index < values.length; index += stride) {
    sum += values[index] as number;
    count += 1;
  }
  return count > 0 ? sum / count : 0;
}

describe("recenterHipsTranslation", () => {
  it("soustrait les moyennes x/z de la piste hips, Y et sway preserves", () => {
    const track = new VectorKeyframeTrack(
      "J_Bip_C_Hips.position",
      [0, 0.5, 1],
      [-16.7, 90.35, 3.01, -14.0, 90.47, 3.34, -15.35, 90.41, 3.175]
    );
    const clip = new AnimationClip("idle_loop", 1, [track]);

    const result = recenterHipsTranslation(clip, makeHipsVrm("J_Bip_C_Hips"));

    expect(result).toBe(clip);
    expect(track.values[0]).toBeCloseTo(-1.35, 5);
    expect(track.values[1]).toBeCloseTo(90.35, 5);
    expect(track.values[2]).toBeCloseTo(-0.165, 5);
    expect(track.values[3]).toBeCloseTo(1.35, 5);
    expect(track.values[4]).toBeCloseTo(90.47, 5);
    expect(track.values[5]).toBeCloseTo(0.165, 5);
    expect(track.values[6]).toBeCloseTo(0, 5);
    expect(track.values[7]).toBeCloseTo(90.41, 5);
    expect(track.values[8]).toBeCloseTo(0, 5);
  });

  it("invariant : la moyenne X et Z resultante est ~0, la moyenne Y est inchangee", () => {
    const track = new VectorKeyframeTrack(
      "J_Bip_C_Hips.position",
      [0, 0.5, 1],
      [-16.7, 90.35, 3.01, -14.0, 90.47, 3.34, -15.35, 90.41, 3.175]
    );
    const originalMeanY = meanOf(track.values, 1, 3);
    const clip = new AnimationClip("idle_loop", 1, [track]);

    recenterHipsTranslation(clip, makeHipsVrm("J_Bip_C_Hips"));

    expect(meanOf(track.values, 0, 3)).toBeCloseTo(0, 5);
    expect(meanOf(track.values, 2, 3)).toBeCloseTo(0, 5);
    expect(meanOf(track.values, 1, 3)).toBeCloseTo(originalMeanY, 5);
  });

  it("laisse les autres pistes intactes et ne recentre que la position des hips", () => {
    const hipsTrack = new VectorKeyframeTrack(
      "J_Bip_C_Hips.position",
      [0, 1],
      [-2, 0, -4, -4, 0, -6]
    );
    const spineTrack = new QuaternionKeyframeTrack(
      "J_Bip_C_Spine.quaternion",
      [0, 1],
      [0, 0, 0, 1, 0, 0, 0, 1]
    );
    const clip = new AnimationClip("fidget", 1, [hipsTrack, spineTrack]);

    recenterHipsTranslation(clip, makeHipsVrm("J_Bip_C_Hips"));

    expect(Array.from(hipsTrack.values)).toEqual([1, 0, 1, -1, 0, -1]);
    expect(Array.from(spineTrack.values)).toEqual([0, 0, 0, 1, 0, 0, 0, 1]);
  });

  it("clip inchange quand le VRM n'a pas de noeud hips", () => {
    const track = new VectorKeyframeTrack(
      "J_Bip_C_Hips.position",
      [0, 1],
      [1, 2, 3, 1, 2, 3]
    );
    const clip = new AnimationClip("clip-a", 1, [track]);

    expect(recenterHipsTranslation(clip, makeHipsVrm(null))).toBe(clip);
    expect(Array.from(track.values)).toEqual([1, 2, 3, 1, 2, 3]);
  });

  it("clip inchange quand aucune piste ne correspond aux hips", () => {
    const track = new VectorKeyframeTrack(
      "Other.position",
      [0, 1],
      [1, 2, 3, 1, 2, 3]
    );
    const clip = new AnimationClip("clip-b", 1, [track]);

    expect(recenterHipsTranslation(clip, makeHipsVrm("J_Bip_C_Hips"))).toBe(
      clip
    );
    expect(Array.from(track.values)).toEqual([1, 2, 3, 1, 2, 3]);
  });

  it("clip inchange quand la piste hips n'est pas une VectorKeyframeTrack", () => {
    const track = new QuaternionKeyframeTrack(
      "J_Bip_C_Hips.position",
      [0, 1],
      [0, 0, 0, 1, 0, 0, 0, 1]
    );
    const clip = new AnimationClip("clip-c", 1, [track]);

    expect(recenterHipsTranslation(clip, makeHipsVrm("J_Bip_C_Hips"))).toBe(
      clip
    );
    expect(Array.from(track.values)).toEqual([0, 0, 0, 1, 0, 0, 0, 1]);
  });

  it("piste vide : clip inchange, aucun NaN", () => {
    // three interdit la construction d'une piste vide ; on vide une piste
    // valide pour eprouver le garde `times.length === 0` avant tout calcul.
    const track = new VectorKeyframeTrack(
      "J_Bip_C_Hips.position",
      [0],
      [0, 0, 0]
    );
    track.times = new Float32Array(0);
    track.values = new Float32Array(0);
    const clip = new AnimationClip("clip-d", 0, [track]);

    expect(recenterHipsTranslation(clip, makeHipsVrm("J_Bip_C_Hips"))).toBe(
      clip
    );
    expect(track.values.length).toBe(0);
    expect(Array.from(track.values).some(Number.isNaN)).toBe(false);
  });
});

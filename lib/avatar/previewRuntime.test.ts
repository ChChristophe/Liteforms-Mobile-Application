import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { TARGET_VRM_HEIGHT, normalizeVrmHeight } from "./previewRuntime";

/**
 * Protege l'invariant de cadrage 15/09 : tout VRM, quelle que soit sa bbox
 * d'origine (grand, petit, bras ecartes), ressort a TARGET_VRM_HEIGHT de
 * haut — la distance camera devient constante pour tout modele.
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

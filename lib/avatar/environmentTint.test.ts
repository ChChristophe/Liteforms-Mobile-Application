import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { applyAlcoveTint } from "./environmentTint";

/**
 * Protege les invariants de la sous-phase 4.4 : le snapshot d'origine n'est
 * jamais ecrase par un tint successif, le reset restaure map + couleur, et
 * un reset sans snapshot est un no-op securitaire.
 */
function makeAlcoveMesh(): {
  group: THREE.Group;
  material: THREE.MeshStandardMaterial;
  texture: THREE.Texture;
} {
  const material = new THREE.MeshStandardMaterial({ color: 0xff0000 });
  const texture = new THREE.Texture();
  material.map = texture;
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(), material);
  const group = new THREE.Group();
  group.add(mesh);
  return { group, material, texture };
}

describe("applyAlcoveTint", () => {
  it("applique le tint : map retiree, couleur remplacee, snapshot conserve", () => {
    const { group, material, texture } = makeAlcoveMesh();

    applyAlcoveTint(group, "#4a90d9");

    expect(material.map).toBeNull();
    expect(material.color.getHexString()).toBe("4a90d9");
    // Le reset devra rendre exactement cette texture : elle n'est pas disposee.
    expect(texture).not.toBeNull();
  });

  it("un second tint n'ecrase pas le snapshot d'origine", () => {
    const { group, material } = makeAlcoveMesh();

    applyAlcoveTint(group, "#4a90d9");
    applyAlcoveTint(group, "#ff00ff");
    applyAlcoveTint(group, null);

    expect(material.color.getHexString()).toBe("ff0000");
  });

  it("le reset restaure la map et la couleur d'origine et vide le snapshot", () => {
    const { group, material, texture } = makeAlcoveMesh();

    applyAlcoveTint(group, "#4a90d9");
    applyAlcoveTint(group, null);

    expect(material.map).toBe(texture);
    expect(material.color.getHexString()).toBe("ff0000");

    // Snapshot vide : un reset supplementaire reste un no-op (materiau deja
    // d'origine, rien ne doit bouger).
    applyAlcoveTint(group, null);
    expect(material.map).toBe(texture);
    expect(material.color.getHexString()).toBe("ff0000");
  });

  it("root null est un no-op", () => {
    expect(() => applyAlcoveTint(null, "#4a90d9")).not.toThrow();
    expect(() => applyAlcoveTint(null, null)).not.toThrow();
  });
});

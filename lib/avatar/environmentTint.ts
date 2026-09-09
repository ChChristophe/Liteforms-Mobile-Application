import * as THREE from "three";

/**
 * Tint de l'alcove (portage Web `lib/avatar/environmentLoader.ts`, PLAN.md
 * sous-phase 4.4).
 *
 * Comportement reference Web conserve :
 * - appliquer une couleur hex : la map de chaque materiau est retiree et la
 *   couleur remplacee par le hex (rendu uni) ;
 * - restaurer (hex null) : la map et la couleur d'origine reviennent.
 *
 * Invariants exiges par la sous-phase 4.4 :
 * - un snapshot des materiaux originaux est conserve (WeakMap) AVANT la
 *   premiere modification ; les tint suivants ne l'ecrasent pas ;
 * - le reset restaure exactement le snapshot puis vide la memoire ;
 * - aucune texture n'est disposee : retirer une map ne detruit pas la
 *   texture, elle reste restorable.
 *
 * Portee : appelee uniquement sur la scene de l'alcove, jamais sur le VRM.
 * Pur JS three (aucun GL) : testable hors appareil.
 */

type MaterialSnapshot = { colorHex: string; map: THREE.Texture | null };

/** Snapshots par materiau ; GC automatique a la destruction du materiau. */
const originalMaterials = new WeakMap<THREE.Material, MaterialSnapshot>();

/**
 * Applique ou retire le tint de couleur sur tous les materiaux d'un sous-arbre.
 *
 * @param root objet three racine (scene de l'alcove) ; null/undefined = no-op
 * @param hex couleur cible ("#rrggbb") pour appliquer le tint, ou null pour
 *   restaurer les materiaux d'origine
 */
export function applyAlcoveTint(
  root: THREE.Object3D | null | undefined,
  hex: string | null
): void {
  if (!root) return;
  root.traverse((child) => {
    const mesh = child as THREE.Mesh;
    if (!(mesh as unknown as { isMesh?: boolean }).isMesh) return;
    const materials = Array.isArray(mesh.material)
      ? mesh.material
      : [mesh.material];
    for (const material of materials) {
      applyTintToMaterial(material as THREE.MeshStandardMaterial, hex);
    }
  });
}

/**
 * Tint ou restaure un materiau. Un materiau sans propriete `color` est ignore.
 * @param hex null restaure le snapshot (map + couleur) s'il existe.
 */
function applyTintToMaterial(
  material: THREE.MeshStandardMaterial,
  hex: string | null
): void {
  if (!material.color) return;
  if (hex) {
    rememberOriginalMaterial(material);
    material.map = null;
    material.color.set(hex);
    material.needsUpdate = true;
    return;
  }
  restoreOriginalMaterial(material);
}

/** Mémorise l'etat d'origine une seule fois par materiau. */
function rememberOriginalMaterial(material: THREE.MeshStandardMaterial): void {
  if (originalMaterials.has(material)) return;
  originalMaterials.set(material, {
    colorHex: `#${material.color.getHexString()}`,
    map: material.map,
  });
}

/**
 * Restaure le snapshot d'un materiau. Sans snapshot (jamais tinte), no-op
 * securitaire : ne modifie jamais un materiau vierge.
 */
function restoreOriginalMaterial(material: THREE.MeshStandardMaterial): void {
  const snapshot = originalMaterials.get(material);
  if (!snapshot) return;
  material.map = snapshot.map;
  material.color.set(snapshot.colorHex);
  material.needsUpdate = true;
  originalMaterials.delete(material);
}

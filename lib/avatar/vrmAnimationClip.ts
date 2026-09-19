import * as THREE from "three";
import type { VRM } from "@pixiv/three-vrm";

/**
 * Recentrage de la translation des hips d'un clip VRMA (portage Mobile du
 * correctif Web `050c195`, `lib/avatar/vrmAnimationLoader.ts`).
 *
 * Contexte : la piste de position des hips du clip d'idle VRMA porte une
 * translation laterale moyenne non nulle — le personnage derive sur le cote
 * pendant toute la boucle. Le correctif soustrait la moyenne des composantes
 * X et Z sur toute la piste, ce qui recentre l'avatar sans toucher a la
 * hauteur (Y) ni au balancement residuel (le "sway" : les ecarts a la moyenne
 * sont conserves).
 *
 * Portee : logique metier pure three, aucun acces navigateur ni GL. Elle est
 * appliquee a TOUS les clips produits par `createVRMAnimationClip` — idle
 * comme animations ponctuelles — exactement comme `loadVrmAnimationClip` cote
 * Web.
 *
 * No-op (clip retourne inchange) si :
 * - le VRM n'a pas de noeud hips normalise ;
 * - le clip n'a pas de piste `<nom des hips>.position` ;
 * - la piste trouvee n'est pas une `VectorKeyframeTrack` ;
 * - la piste est vide (evite une division par zero et tout NaN).
 *
 * @param clip clip d'animation VRMA a recentrer (mute en place si applicable)
 * @param vrm VRM cible, source du nom du noeud hips normalise
 * @returns le clip fourni, recentre ou inchange
 */
export function recenterHipsTranslation(
  clip: THREE.AnimationClip,
  vrm: VRM
): THREE.AnimationClip {
  const hipsNode = vrm.humanoid?.getNormalizedBoneNode("hips");
  if (!hipsNode) {
    return clip;
  }
  const track = clip.tracks.find(
    (candidate) => candidate.name === `${hipsNode.name}.position`
  );
  if (
    !(track instanceof THREE.VectorKeyframeTrack) ||
    track.times.length === 0
  ) {
    return clip;
  }
  const values = track.values;
  let sumX = 0;
  let sumZ = 0;
  for (let index = 0; index < values.length; index += 3) {
    sumX += values[index] as number;
    sumZ += values[index + 2] as number;
  }
  const sampleCount = values.length / 3;
  const meanX = sumX / sampleCount;
  const meanZ = sumZ / sampleCount;
  track.values = values.map((value, index) => {
    if (index % 3 === 1) {
      return value;
    }
    return value - (index % 3 === 0 ? meanX : meanZ);
  });
  return clip;
}

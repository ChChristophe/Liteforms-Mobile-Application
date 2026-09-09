import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { VRMLoaderPlugin, VRMUtils, type VRM } from "@pixiv/three-vrm";
import {
  createVRMAnimationClip,
  VRMAnimationLoaderPlugin,
  VRMLookAtQuaternionProxy,
  type VRMAnimation,
} from "@pixiv/three-vrm-animation";
import * as THREE from "three";
import type { ExpoWebGLRenderingContext } from "expo-gl";

/**
 * Runtime de preview VRM natif (PLAN.md Phase 4).
 *
 * Pipeline exige :
 * - arrayBuffers deja charges (loadBundledAssetBuffer) ;
 * - GLTFLoader.parse + VRMLoaderPlugin pour le VRM ; GLTFLoader + VRMAnimationLoaderPlugin pour l'animation VRMA ;
 * - GLTFLoader pour l'alcove ; eclairage simple ; camera fixe ;
 * - par frame : AnimationMixer.update, VRM.update, renderer.render, gl.endFrameEXP.
 *
 * Cycle de vie (sous-phase 4.1) :
 * - dispose() arrete TOUT : mixer, clip, materiaux/geometries/textures,
 *   VRM et renderer ; le contexte GL est detruit par le possesseur du
 *   GLView (destroyContextAsync a l'unmount du composant) ;
 * - la boucle RAF vit dans le COMPOSANT, pas ici — le runtime n'update que
 *   delta ; un appel apres dispose est inoperant.
 *
 * Exclusions produit : Looking Glass/WebXR/lip-sync/audio n'existent pas ici.
 */

export type PreviewHandle = {
  /**
   * Avance le preview d'un delta (secondes) et rend une frame.
   * Sans effet si dispose() a ete appele.
   */
  frame: (deltaSeconds: number) => void;
  /** Libere geometries, materiaux, textures, mixer, VRM et renderer. */
  dispose: () => void;
};

function disposeSceneResources(scene: THREE.Object3D | null): void {
  if (!scene) return;
  scene.traverse((object: THREE.Object3D) => {
    const mesh = object as THREE.Mesh;
    if (mesh.geometry) mesh.geometry.dispose();
    const material = mesh.material as
      | THREE.Material
      | THREE.Material[]
      | undefined;
    if (!material) return;
    const materialList = Array.isArray(material) ? material : [material];
    for (const materialItem of materialList) {
      for (const value of Object.values(materialItem) as unknown[]) {
        if (value instanceof THREE.Texture) value.dispose();
      }
      materialItem.dispose();
    }
  });
}

/**
 * Charge alcove, VRM et animation VRMA depuis des buffers, monte la scene,
 * et renvoie un handle de frames.
 *
 * @param gl contexte expo-gl (GLView.onContextCreate)
 * @param width, height dimensions du GLView
 * @param buffers binaires des trois assets
 * @throws en cas d'echec de parsing : le composant affiche error + retry.
 */
export async function startPreviewRuntime(
  gl: ExpoWebGLRenderingContext,
  width: number,
  height: number,
  buffers: { vrm: ArrayBuffer; alcove: ArrayBuffer; animation: ArrayBuffer }
): Promise<PreviewHandle> {
  let disposed = false;
  const disposables: Array<{ dispose: () => void }> = [];

  // --- renderer + scene -------------------------------------------------
  const { createExpoRenderer } = await import("./expoRenderer");
  const renderer = createExpoRenderer(gl, width, height);
  disposables.push(renderer);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(30, width / height, 0.1, 20);
  camera.position.set(0, 1.3, 1.8);
  camera.lookAt(0, 1.0, 0);

  // Eclairage reference Web (`AvatarScene`) : ambiant chaud + key light fort
  // + fill teinte. MToon (three-vrm) lit la premiere DirectionalLight pour le
  // sens de l'ombrage toon ; sans key light nette, le modele parait plat.
  scene.add(new THREE.AmbientLight("#fff6e5", 1.2));
  const keyLight = new THREE.DirectionalLight("#ffffff", 2.4);
  keyLight.position.set(0.5, 0.5, 2);
  scene.add(keyLight);
  const fillLight = new THREE.DirectionalLight("#70d6c5", 1.0);
  fillLight.position.set(-2, 0.5, 3);
  scene.add(fillLight);

  // --- VRM --------------------------------------------------------------
  const vrmLoader = new GLTFLoader();
  vrmLoader.register((parser) => new VRMLoaderPlugin(parser));

  const vrm = await new Promise<VRM>((resolve, reject) => {
    vrmLoader.parse(buffers.vrm, "", (gltf) => {
      const vrm = gltf.userData.vrm as VRM | undefined;
      if (!vrm) {
        reject(new Error("VRMLoaderPlugin did not produce a VRM"));
        return;
      }
      // Nettoyage squelette/recommended par three-vrm.
      VRMUtils.removeUnnecessaryVertices(gltf.scene);
      VRMUtils.combineSkeletons(gltf.scene);
      // VRM 0.x regarde +Z ; la camera three vise -Z. Rotation de 180 degres
      // (reference Web `AvatarScene`) sinon l'avatar presente son dos.
      VRMUtils.rotateVRM0(vrm);
      resolve(vrm);
    }, reject);
  });

  scene.add(vrm.scene);
  // Proxy requis par createVRMAnimationClip pour la piste lookAt du VRMA ;
  // sans lui, la fonction en cree un elle-meme et log un warning. Il doit
  // vivre dans `vrm.scene` (c'est la que createVRMAnimationClip le cherche).
  if (vrm.lookAt) {
    const lookAtProxy = new VRMLookAtQuaternionProxy(vrm.lookAt);
    lookAtProxy.name = "VRMLookAtQuaternionProxy";
    vrm.scene.add(lookAtProxy);
  }
  // Cadrage automatique (Phase 4) : la boite englobante remplace la position
  // d'illusion pour n'importe quel VRM (taille et pivot variables).
  const bbox = new THREE.Box3().setFromObject(vrm.scene);
  const bboxSize = bbox.getSize(new THREE.Vector3());
  const bboxCenter = bbox.getCenter(new THREE.Vector3());
  const maxDimension = Math.max(bboxSize.x, bboxSize.y, bboxSize.z) || 1;
  const fillDistance = (maxDimension / 2) / Math.tan((camera.fov * Math.PI) / 360);
  camera.position.set(
    bboxCenter.x,
    bboxCenter.y + bboxSize.y * 0.05,
    bboxCenter.z + fillDistance * 1.45
  );
  camera.lookAt(bboxCenter);

  // --- animation VRMA ---------------------------------------------------
  let mixer: THREE.AnimationMixer | null = null;
  const animationLoader = new GLTFLoader();
  animationLoader.register((parser) => new VRMAnimationLoaderPlugin(parser));

  const vrmaGltf = await new Promise((resolve, reject) => {
    animationLoader.parse(buffers.animation, "", resolve, reject);
  });
  // Le plugin VRMAnimationLoaderPlugin ecrit `userData.vrmAnimations` (PLURIEL,
  // tableau), pas `vrmAnimation`. Lire le mauvais nom => aucune animation.
  const vrma = (
    vrmaGltf as { userData: { vrmAnimations?: VRMAnimation[] } }
  ).userData.vrmAnimations?.[0];
  if (vrma) {
    // three-vrm v3 : le clip passe par la fonction libre (pas une methode).
    const clip = createVRMAnimationClip(vrma, vrm as unknown as Parameters<typeof createVRMAnimationClip>[1]);
    mixer = new THREE.AnimationMixer(vrm.scene);
    mixer.clipAction(clip).play();
    disposables.push({
      dispose: () => {
        mixer?.stopAllAction();
        mixer?.uncacheClip(clip);
      },
    });
  }

  // --- alcove -----------------------------------------------------------
  const alcoveLoader = new GLTFLoader();
  const alcoveGltf = await new Promise((resolve, reject) => {
    alcoveLoader.parse(buffers.alcove, "", resolve, reject);
  });
  const alcoveScene = (alcoveGltf as { scene: THREE.Group }).scene;
  // Positionnement relatif a l'avatar : centre sur la bbox de l'avatar, a
  // l'echelle native de l'alcove (les unites du .glb sont les leurs). Le
  // calage fin (echelle/offset) se fera en 4.4-4.5 sur device.
  alcoveScene.position.set(bboxCenter.x, bbox.min.y, bboxCenter.z);
  scene.add(alcoveScene);

  return {
    frame(deltaSeconds) {
      if (disposed) return;
      mixer?.update(deltaSeconds);
      vrm.update(deltaSeconds);
      renderer.render(scene, camera);
      // Presente la framebuffer expo-gl (swap buffers equivalent, docs GLView).
      gl.endFrameEXP();
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      for (const d of disposables) d.dispose();
      disposeSceneResources(vrm.scene);
      void (vrm as unknown as { dispose?: () => void }).dispose?.();
      disposeSceneResources(alcoveScene);
      scene.clear();
    },
  };
}

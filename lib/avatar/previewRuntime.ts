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
import { applyAlcoveTint } from "./environmentTint";
import {
  computeInsetFootprint,
  computeModelPositionFromBounds,
  measureRenderableMeshBounds,
  solveUniformScaleMultiplierForFootprint,
  solveUniformScaleMultiplierForMaxAxis,
  type ModelFootprint,
} from "./modelFraming";
import {
  POSE_DEPTH_MAX,
  POSE_DEPTH_MIN,
  POSE_ZOOM_MAX,
  POSE_ZOOM_MIN,
  type AvatarPoseConfig,
} from "../../types/config";
import type { AvatarMood } from "../../types/config";

/**
 * Cadrage du preview : reproduction FIDELE du /hologram Desktop
 * (`modelFraming.ts` + `AvatarScene`). Le lobster est cadre a `maxAxis =
 * REF_MAX_AXIS`, les modeles importes dans l'empreinte de ce lobster cadre
 * (inseree 0.9/0.82 par `computeInsetFootprint`). L'alcove suit la MEME
 * echelle/position que le modele (`environmentScale`/`environmentPosition`).
 * La camera est FIXE.
 */
export const REF_MAX_AXIS = 1.8;

// Facteurs de cadrage camera (figes sur le baseline lobster).
/** Recul camera = fillDistance x ce facteur (cadrage d'origine du Web). */
export const CAM_FILL_DISTANCE_FACTOR = 1.45;
/** Calage vertical camera = hauteur lobster x ce facteur (au-dessus du centre). */
export const CAM_PIVOT_OFFSET_Y_FACTOR = 0.05;
/** Decalage vertical des modeles importes (constant d'AvatarScene Electron). */
export const IMPORTED_MODEL_VERTICAL_OFFSET = 0.025;

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
  /**
   * Applique (hex) ou retire (null) le tint de couleur de l'alcove, sans
   * recharger aucun asset. Snapshot/restauration geres par
   * `lib/avatar/environmentTint`.
   */
  setAlcoveTint: (hex: string | null) => void;
  /**
   * Applique un mood via les expressions VRM (reset + poids 1 si l'expression
   * a des binds morph) sans recharger le VRM. Un VRM sans binds (ex.
   * lobsterEdit) reste visuellement inchange mais l'API reste correcte.
   * Mood Mobile = preset d'expression ; n'a aucun lien avec l'animation
   * audio/lip-sync Desktop.
   */
  setMood: (mood: AvatarMood | null) => void;
  /**
   * Zone ecran de l'avatar, en fractions du GLView autour du centre
   * (l'avatar reste centre : la camera vise le centre de sa bbox). Sert au
   * composant RN pour decider si un drag tourne l'avatar ou l'alcove.
   * Les fractions sont les RAYONS d'une ellipse (test du composant :
   * (dx/hw)^2 + (dy/hh)^2 <= 1) — une bbox rectangulaire d'un VRM aux bras
   * ecartes couvrirait presque toute la largeur ecran et rendrait l'alcove
   * intouchable ; l'ellipse epouse une silhouette debout.
   * Dimensions logiques (dp) : comparer `x/vue.largeur` aux fractions.
   * Null tant que le cadrage n'a pas ete calcule.
   */
  getAvatarZone: () => { halfWidthFrac: number; halfHeightFrac: number } | null;
  /**
   * Drag horizontal (4.5) : `target` 'avatar' tourne le VRM sur son axe
   * vertical, 'alcove' tourne l'alcove sur place. La camera ne bouge plus.
   * Le signe est choisi pour reproduire le sens visuel de l'ancienne orbite
   * camera (orbite +yaw = rotation objet -yaw).
   */
  dragRotate: (target: "avatar" | "alcove", yawDeltaRadians: number) => void;
  /**
   * Fixe le zoom (multiplicateur de distance camera). Les valeurs hors
   * bornes sont contraintes silencieusement sur POSE_ZOOM_MIN/MAX : le
   * geste ne doit jamais produire d'etat invalide.
   */
  setZoom: (zoom: number) => void;
  /**
   * Fixe la profondeur de l'avatar (offset Z en unites monde). Contraint sur
   * POSE_DEPTH_MIN/MAX pour la meme raison.
   */
  setDepth: (depth: number) => void;
  /**
   * Pose courante, yaws RELATIFS a l'orientation naturelle du modele :
   * valeur prete a persister dans `DeviceConfig.avatar.pose` et a renvoyer
   * au Desktop. A appeler en fin de geste seulement (jamais par frame).
   */
  getPose: () => AvatarPoseConfig;
  /**
   * Applique absolument une pose persistee (rotation, zoom, profondeur) :
   * idempotent, reutilise au montage et a chaque changement du store.
   */
  applyPose: (pose: AvatarPoseConfig) => void;
  /** Met a jour l'aspect camera + la taille du renderer quand le GLView
   * (re)prend sa taille reelle (corrige les tailles transitoires du
   * contexte). `width`/`height` = dimensions physiques du framebuffer. */
  resize: (width: number, height: number) => void;
  /** Libere geometries, materiaux, textures, mixer, VRM et renderer. */
  dispose: () => void;
};

/**
 * Resultat d'un cadrage (port de `applyMeasuredFraming` d'AvatarScene
 * Electron) : echelle uniforme + position racine + cible camera.
 */
type AppliedFraming = {
  footprint: ModelFootprint;
  scaleMultiplier: number;
  finalScale: THREE.Vector3;
  finalPosition: THREE.Vector3;
  finalSize: THREE.Vector3;
  finalBoundsBottom: number;
  cameraTarget: THREE.Vector3;
};

function measureSizeAtScale(
  object: THREE.Object3D,
  baseScale: THREE.Vector3,
  basePosition: THREE.Vector3,
  multiplier: number
): THREE.Vector3 {
  object.scale.copy(baseScale).multiplyScalar(multiplier);
  object.position.copy(basePosition);
  object.updateWorldMatrix(true, true);
  return measureRenderableMeshBounds(object).size;
}

function solveRootPositionForBounds(
  object: THREE.Object3D,
  basePosition: THREE.Vector3,
  finalSize: THREE.Vector3,
  targetBottom = -0.05
): THREE.Vector3 {
  object.position.copy(basePosition);
  object.updateWorldMatrix(true, true);
  const baseCenter = measureRenderableMeshBounds(object).center;
  const solvedPosition = computeModelPositionFromBounds(
    basePosition,
    baseCenter,
    finalSize,
    targetBottom
  );

  const probePosition = basePosition.clone();
  probePosition.y += 1;
  object.position.copy(probePosition);
  object.updateWorldMatrix(true, true);
  const probeCenter = measureRenderableMeshBounds(object).center;
  const yResponse = probeCenter.y - baseCenter.y;
  const desiredYShift = solvedPosition.y - basePosition.y;
  solvedPosition.y = basePosition.y + (Math.abs(yResponse) > 1e-6 ? desiredYShift / yResponse : desiredYShift);

  object.position.copy(solvedPosition);
  object.updateWorldMatrix(true, true);
  return solvedPosition;
}

/** Cadrage (port fidele d'AvatarScene Electron). Mutation en place. */
function applyMeasuredFraming(
  object: THREE.Object3D,
  target:
    | { kind: "maxAxis"; value: number }
    | { kind: "footprint"; value: ModelFootprint },
  options: { targetBottom?: number } = {}
): AppliedFraming {
  const baseScale = object.scale.clone();
  const basePosition = object.position.clone();
  object.position.copy(basePosition);
  object.updateWorldMatrix(true, true);

  const measureAtMultiplier = (multiplier: number) =>
    measureSizeAtScale(object, baseScale, basePosition, multiplier);
  const scaleMultiplier =
    target.kind === "maxAxis"
      ? solveUniformScaleMultiplierForMaxAxis(measureAtMultiplier, target.value)
      : solveUniformScaleMultiplierForFootprint(measureAtMultiplier, target.value);

  const finalScale = baseScale.clone().multiplyScalar(scaleMultiplier);
  object.scale.copy(finalScale);
  object.position.copy(basePosition);
  object.updateWorldMatrix(true, true);
  const scaledBounds = measureRenderableMeshBounds(object);
  const finalPosition = solveRootPositionForBounds(
    object,
    basePosition,
    scaledBounds.size,
    options.targetBottom
  );
  const finalBounds = measureRenderableMeshBounds(object);
  const finalBoundsBottom = finalBounds.center.y - finalBounds.size.y * 0.5;
  const cameraTarget = new THREE.Vector3(0, Math.max(0.75, finalBounds.size.y * 0.45), 0);

  return {
    footprint: { width: finalBounds.size.x, height: finalBounds.size.y },
    scaleMultiplier,
    finalScale,
    finalPosition,
    finalSize: finalBounds.size,
    finalBoundsBottom,
    cameraTarget,
  };
}

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
 * Reference de cadrage du lobster (cadre a `maxAxis = REF_MAX_AXIS`) :
 * son empreinte (X/Y) sert de cible aux modeles importes, `boundsBottom`
 * sert a caler leurs pieds au meme niveau que le lobster.
 */
export type LobsterReference = {
  footprint: ModelFootprint;
  boundsBottom: number;
  /** Echelle du lobster cadre (constante pour l'alcove, TOUT modele). */
  environmentScale: THREE.Vector3;
  /** Position du lobster cadre (constante pour l'alcove, TOUT modele). */
  environmentPosition: THREE.Vector3;
};

/** Fallback si la mesure du lobster echoue (mirroir d'AvatarScene Electron). */
const FALLBACK_LOBSTER_REFERENCE: LobsterReference = {
  footprint: { width: REF_MAX_AXIS, height: REF_MAX_AXIS },
  boundsBottom: -0.05,
  environmentScale: new THREE.Vector3(1, 1, 1),
  environmentPosition: new THREE.Vector3(),
};

// --- Calibration (bundle lobster, une fois par session) -------------------
let bundledVrmBufferPromise: Promise<ArrayBuffer> | null = null;
let lobsterReference: LobsterReference | null = null;

/** Resultat de parse pour la mesure (injectable en test). */
type ParsedVrmScene = { scene: THREE.Object3D; vrm: VRM | null };

async function parseVrmForMeasure(buffer: ArrayBuffer): Promise<ParsedVrmScene> {
  const loader = new GLTFLoader();
  loader.register((parser) => new VRMLoaderPlugin(parser));
  const gltf = await new Promise<{
    scene: THREE.Object3D;
    userData: { vrm?: VRM };
  }>((resolve, reject) => loader.parse(buffer, "", resolve, reject));
  return { scene: gltf.scene, vrm: gltf.userData.vrm ?? null };
}

/**
 * Mesure la reference de cadrage du lobster depuis son buffer : parse jetable,
 * `rotateVRM0` avant la mesure, cadrage `maxAxis = REF_MAX_AXIS`. Echec -> null.
 */
export async function measureLobsterReference(
  buffer: ArrayBuffer,
  parse: (buffer: ArrayBuffer) => Promise<ParsedVrmScene> = parseVrmForMeasure
): Promise<LobsterReference | null> {
  let parsed: ParsedVrmScene;
  try {
    parsed = await parse(buffer);
  } catch {
    return null;
  }
  if (parsed.vrm) VRMUtils.rotateVRM0(parsed.vrm);
  const framing = applyMeasuredFraming(parsed.scene, {
    kind: "maxAxis",
    value: REF_MAX_AXIS,
  });
  disposeSceneResources(parsed.scene);
  void (parsed.vrm as unknown as { dispose?: () => void } | null)?.dispose?.();
  return {
    footprint: framing.footprint,
    boundsBottom: framing.finalBoundsBottom,
    environmentScale: framing.finalScale.clone(),
    environmentPosition: framing.finalPosition.clone(),
  };
}

/**
 * Resout la reference lobster (cache module, une mesure par session) :
 * - lobster affiche : sa reference mesuree devient le cache ;
 * - resident affiche : cache si present, sinon mesure PARESSEUSE du buffer
 *   bundle ; echec -> fallback (cache non pollue) ;
 * - retourne TOUJOURS une reference (jamais null).
 */
export async function resolveLobsterReference(input: {
  isLobster: boolean;
  nativeReference?: LobsterReference | null;
  bundledVrm?: ArrayBuffer;
  parse?: (buffer: ArrayBuffer) => Promise<ParsedVrmScene>;
}): Promise<LobsterReference> {
  if (input.isLobster && input.nativeReference) {
    lobsterReference = input.nativeReference;
  } else if (lobsterReference === null && input.bundledVrm) {
    const measured = await measureLobsterReference(input.bundledVrm, input.parse);
    if (measured !== null) {
      lobsterReference = measured;
    }
  }
  return lobsterReference ?? FALLBACK_LOBSTER_REFERENCE;
}

/**
 * Buffer du VRM bundle en cache module : UN SEUL chargement par session
 * d'app (Promise.all de demarrage, reload runtime inclus). Un echec de
 * chargement ne reste pas en cache : l'appel suivant reessaie.
 */
export function getBundledVrmBuffer(
  load: () => Promise<ArrayBuffer>
): Promise<ArrayBuffer> {
  if (bundledVrmBufferPromise === null) {
    bundledVrmBufferPromise = load().catch((error) => {
      bundledVrmBufferPromise = null;
      throw error;
    });
  }
  return bundledVrmBufferPromise;
}

/** Tests : vide la calibration module (buffer cache + reference mesuree). */
export function resetVrmCalibration(): void {
  bundledVrmBufferPromise = null;
  lobsterReference = null;
}

/**
 * Charge alcove, VRM et animation VRMA depuis des buffers, monte la scene,
 * et renvoie un handle de frames.
 *
 * @param gl contexte expo-gl (GLView.onContextCreate)
 * @param width, height dimensions du GLView
 * @param buffers binaires des trois assets + buffer du bundle lobster
 *   (precharge une fois par session par l'appelant via `getBundledVrmBuffer`,
 *   base de la calibration de hauteur cible)
 * @throws en cas d'echec de parsing : le composant affiche error + retry.
 */
export async function startPreviewRuntime(
  gl: ExpoWebGLRenderingContext,
  width: number,
  height: number,
  buffers: {
    vrm: ArrayBuffer;
    alcove: ArrayBuffer;
    animation: ArrayBuffer;
    bundledVrm: ArrayBuffer;
  }
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
    vrmLoader.parse(buffers.vrm, "", async (gltf) => {
      try {
        const vrm = gltf.userData.vrm as VRM | undefined;
        if (!vrm) {
          reject(new Error("VRMLoaderPlugin did not produce a VRM"));
          return;
        }
        // Nettoyage squelette/recommended par three-vrm.
        VRMUtils.removeUnnecessaryVertices(gltf.scene);
        VRMUtils.combineSkeletons(gltf.scene);
        // Rotation 0.x AVANT le cadrage (mesure sur le bon axe).
        VRMUtils.rotateVRM0(vrm);
        resolve(vrm);
      } catch (error) {
        reject(error);
      }
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
  // Cadrage (reproduction FIDELE du /hologram Desktop : `modelFraming.ts`
  // + `applyMeasuredFraming` d'AvatarScene). Le lobster est cadre a
  // `maxAxis = REF_MAX_AXIS` ; un modele importe est cadre dans l'empreinte
  // du lobster (inseree 0.9/0.82). Proportions natives preservees, alcove a
  // la meme echelle/position que le modele, camera FIXE.
  const isLobster = buffers.vrm === buffers.bundledVrm;
  // Taille native du modele affiche (avant cadrage) — pour le diagnostic.
  const nativeBounds = measureRenderableMeshBounds(vrm.scene);
  let framing: AppliedFraming;
  // Reference alcove : CONSTANTE du lobster, quel que soit le modele affiche.
  let environmentReference: LobsterReference;
  if (isLobster) {
    framing = applyMeasuredFraming(vrm.scene, {
      kind: "maxAxis",
      value: REF_MAX_AXIS,
    });
    // Le lobster cadre devient la reference (empreinte + echelle/position
    // de l'alcove) pour les modeles importes.
    environmentReference = {
      footprint: framing.footprint,
      boundsBottom: framing.finalBoundsBottom,
      environmentScale: framing.finalScale.clone(),
      environmentPosition: framing.finalPosition.clone(),
    };
    lobsterReference = environmentReference;
  } else {
    const reference = await resolveLobsterReference({
      isLobster: false,
      bundledVrm: buffers.bundledVrm,
    });
    environmentReference = reference;
    framing = applyMeasuredFraming(
      vrm.scene,
      { kind: "footprint", value: computeInsetFootprint(reference.footprint) },
      { targetBottom: reference.boundsBottom + IMPORTED_MODEL_VERTICAL_OFFSET }
    );
  }
  // `applyMeasuredFraming` a deja positionne le modele ; on fige l'etat.
  vrm.scene.scale.copy(framing.finalScale);
  vrm.scene.position.copy(framing.finalPosition);
  const alignOffset = framing.finalPosition.clone();

  // Camera cadre sur l'EMPREINTE de l'alcove (constante), en tenant compte
  // de l'aspect reel du buffer : la distance est pilotee par la LARGEUR de
  // l'alcove. Comme la largeur du buffer (telephone) est constante, l'alcove
  // occupe une taille en PIXELS constante quel que soit l'aspect du GLView
  // (fix « alcove qui change de taille » — le letterbox ne fixait que
  // l'aspect, pas la taille en pixels).
  const alcoveFootprint = environmentReference.footprint;
  const tanHalf = Math.tan((camera.fov * Math.PI) / 360);
  const halfHFov = Math.atan(tanHalf * (width / height));
  const distV = alcoveFootprint.height / 2 / tanHalf;
  const distH = alcoveFootprint.width / 2 / Math.tan(halfHFov);
  const camDistance = Math.max(distV, distH) * CAM_FILL_DISTANCE_FACTOR;
  const camTarget = new THREE.Vector3(
    0,
    environmentReference.boundsBottom + alcoveFootprint.height / 2,
    0
  );
  camera.position.set(
    camTarget.x,
    camTarget.y + alcoveFootprint.height * CAM_PIVOT_OFFSET_Y_FACTOR,
    camDistance
  );
  camera.lookAt(camTarget);
  // Cadrage de reference : distance et direction figees, le zoom (pose) ne
  // fait que diviser la distance. La camera ne change plus d'orientation.
  const cameraCenter = camTarget.clone();
  let cameraDistance = camera.position.distanceTo(cameraCenter);
  const cameraDirection = camera.position.clone().sub(cameraCenter).normalize();
  // Orientation naturelle du modele (apres correction VRM 0.x) : les yaws
  // de pose sont RELATIFS a cette base (portable sur tout VRM).
  const baseAvatarYaw = vrm.scene.rotation.y;
  // Zoom et profondeur courants (pose) ; bornes partagees avec la validation.
  let zoom = 1;
  let depth = 0;
  // Geste 4.5 : coins de la bbox de l'avatar APRES cadrage (zone du geste).
  const finalBounds = measureRenderableMeshBounds(vrm.scene);
  const halfSize = finalBounds.size.clone().multiplyScalar(0.5);
  const bboxCorners: THREE.Vector3[] = [];
  for (const sx of [-1, 1]) {
    for (const sy of [-1, 1]) {
      for (const sz of [-1, 1]) {
        bboxCorners.push(
          new THREE.Vector3(
            finalBounds.center.x + halfSize.x * sx,
            finalBounds.center.y + halfSize.y * sy,
            finalBounds.center.z + halfSize.z * sz
          )
        );
      }
    }
  }

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
  // L'alcove suit l'echelle/position du LOBSTER (constante), PAS celle du
  // modele affiche — comportement /hologram : `environmentScale`/
  // `environmentPosition` viennent du `lobsterReference` (cadrage maxAxis du
  // lobster), tandis que le modele importe est cadre en empreinte (plus petit).
  alcoveScene.scale.copy(environmentReference.environmentScale);
  alcoveScene.position.copy(environmentReference.environmentPosition);
  scene.add(alcoveScene);

  // Diagnostic cadrage (aide terrain) : valeurs mesurees, en DEV uniquement.
  if (__DEV__) {
    console.log(
      "[previewRuntime] framing",
      JSON.stringify({
        isLobster,
        nativeSize: nativeBounds.size.toArray().map((v) => Number(v.toFixed(3))),
        modelScale: framing.finalScale.toArray().map((v) => Number(v.toFixed(3))),
        modelFinalSize: framing.finalSize.toArray().map((v) => Number(v.toFixed(3))),
        modelPosition: framing.finalPosition.toArray().map((v) => Number(v.toFixed(3))),
        alcoveScale: environmentReference.environmentScale.toArray().map((v) => Number(v.toFixed(3))),
        alcovePosition: environmentReference.environmentPosition.toArray().map((v) => Number(v.toFixed(3))),
        footprint: environmentReference.footprint,
        cameraPos: camera.position.toArray().map((v) => Number(v.toFixed(3))),
        cameraTarget: camTarget.toArray().map((v) => Number(v.toFixed(3))),
        fov: camera.fov,
        aspect: camera.aspect,
      })
    );
  }

  /** Applique un zoom contraint et repositionne la camera (distance seule). */
  function applyZoom(nextZoom: number): void {
    if (disposed) return;
    zoom = Math.min(POSE_ZOOM_MAX, Math.max(POSE_ZOOM_MIN, nextZoom));
    camera.position
      .copy(cameraCenter)
      .addScaledVector(cameraDirection, cameraDistance / zoom);
    camera.lookAt(cameraCenter);
  }

  /** Applique une profondeur contraintee a l'avatar (offset Z monde). */
  function applyDepth(nextDepth: number): void {
    if (disposed) return;
    depth = Math.min(POSE_DEPTH_MAX, Math.max(POSE_DEPTH_MIN, nextDepth));
    // La profondeur est un OFFSET autour de la position alignee du modele
    // (le centre reste confondu avec la baseline lobster, z = alignOffset.z).
    vrm.scene.position.z = alignOffset.z + depth;
  }

  return {
    frame(deltaSeconds) {
      if (disposed) return;
      mixer?.update(deltaSeconds);
      vrm.update(deltaSeconds);
      renderer.render(scene, camera);
      // Presente la framebuffer expo-gl (swap buffers equivalent, docs GLView).
      gl.endFrameEXP();
    },
    setAlcoveTint(hex) {
      // No-op apres dispose : la scene est vidée, plus rien a teinter.
      if (disposed) return;
      applyAlcoveTint(alcoveScene, hex);
    },
    setMood(mood) {
      const expressionManager = vrm.expressionManager;
      if (disposed || !expressionManager) return;
      expressionManager.resetValues();
      if (!mood) return;
      const expression = expressionManager.getExpression(mood);
      // Portage Web `hasBoundVrmExpression` : une expression sans bind morph
      // ne doit pas etre forcee a 1 (aucun effet visible attendu).
      const binds = expression?.binds;
      if (Array.isArray(binds) && binds.length > 0) {
        expressionManager.setValue(mood, 1);
      }
    },
    getAvatarZone() {
      if (disposed) return null;
      camera.updateMatrixWorld(true);
      let minNX = 1;
      let maxNX = -1;
      let minNY = 1;
      let maxNY = -1;
      const projected = new THREE.Vector3();
      for (const corner of bboxCorners) {
        projected.copy(corner).project(camera);
        minNX = Math.min(minNX, projected.x);
        maxNX = Math.max(maxNX, projected.x);
        minNY = Math.min(minNY, projected.y);
        maxNY = Math.max(maxNY, projected.y);
      }
      // Rayons d'ellipse en FRACTIONS d'ecran : l'etendue NDC (plein ecran = 2)
      // doit etre divisee par 2 pour devenir une fraction (plein ecran = 1),
      // puis paddee de 15% (bord de silhouette + imprecision du doigt).
      return {
        halfWidthFrac: ((maxNX - minNX) / 4) * 1.15,
        halfHeightFrac: ((maxNY - minNY) / 4) * 1.15,
      };
    },
    dragRotate(target, yawDeltaRadians) {
      if (disposed) return;
      // Sens visuel de l'ancienne orbite camera : orbite +yaw equivalait a
      // une rotation objet -yaw. La camera reste fixe desormais.
      const delta = -yawDeltaRadians;
      if (target === "avatar") {
        // Rotation autour de l'axe vertical de la racine VRM (pieds) ;
        // pour un VRM debout, equivalent au centre (X/Z du pivot ~ 0).
        vrm.scene.rotation.y += delta;
      } else {
        // L'alcove pivote sur place autour de sa base centree.
        alcoveScene.rotation.y += delta;
      }
    },
    setZoom(nextZoom) {
      applyZoom(nextZoom);
    },
    setDepth(nextDepth) {
      applyDepth(nextDepth);
    },
    getPose() {
      return {
        avatarYaw: vrm.scene.rotation.y - baseAvatarYaw,
        alcoveYaw: alcoveScene.rotation.y,
        zoom,
        depth,
      };
    },
    applyPose(pose) {
      if (disposed) return;
      vrm.scene.rotation.y = baseAvatarYaw + pose.avatarYaw;
      alcoveScene.rotation.y = pose.alcoveYaw;
      applyZoom(pose.zoom);
      applyDepth(pose.depth);
    },
    resize(width, height) {
      if (disposed || width <= 0 || height <= 0) return;
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      renderer.setSize(width, height, false);
      // Recalcule la distance caméra pour que l'alcove garde une LARGEUR
      // en pixels constante, puis reapplique le zoom courant.
      const tan = Math.tan((camera.fov * Math.PI) / 360);
      const halfH = Math.atan(tan * camera.aspect);
      const dV = alcoveFootprint.height / 2 / tan;
      const dH = alcoveFootprint.width / 2 / Math.tan(halfH);
      cameraDistance = Math.max(dV, dH) * CAM_FILL_DISTANCE_FACTOR;
      applyZoom(zoom);
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

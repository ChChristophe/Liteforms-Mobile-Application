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
  POSE_DEPTH_MAX,
  POSE_DEPTH_MIN,
  POSE_ZOOM_MAX,
  POSE_ZOOM_MIN,
  type AvatarPoseConfig,
} from "../../types/config";
import type { AvatarMood } from "../../types/config";

/**
 * Fallback de hauteur cible (unites monde), utilisee UNIQUEMENT si la
 * calibration sur le bundle lobster echoue (buffer illisible, bbox vide).
 *
 * Regression 15/09 v2 : la constante 1.0 comme cible systematique desynchronisait
 * l'alcove (unites natives de son .glb) de l'avatar. La cible reelle est la
 * hauteur native mesuree du bundle lobster (`lobsterEdit.vrm`) — baseline
 * visuel de cadrage : le lobster lui-meme n'est JAMAIS rescale (echelle 1),
 * l'alcove garde ses unites, et tout VRM resident est porte a la hauteur du
 * lobster. Le ratio d'origine est preserve et le cadrage reste constant.
 */
export const TARGET_VRM_HEIGHT = 1.0;

// Facteurs de cadrage camera, figes sur le baseline lobster (incident 15/09
// v3) : offsets multiples de grandeurs LOBSTER donc constants pour tout VRM
// affiche — le zoom ne depend plus de la bbox du modele charge.
/** Recul camera = fillDistance x ce facteur (cadrage d'origine du Web). */
export const CAM_FILL_DISTANCE_FACTOR = 1.45;
/** Calage vertical camera = hauteur lobster x ce facteur (au-dessus du centre). */
export const CAM_PIVOT_OFFSET_Y_FACTOR = 0.05;

// Cadrage par empreinte (reproduction du /hologram Desktop, `modelFraming.ts`
// defaults) : le modele affiche est mis a l'echelle uniforme pour tenir dans
// l'empreinte du lobster, inseree de ces facteurs. Les proportions natives
// sont preservees (un modele large/plat reste plat, un petit reste petit) —
// contrairement a une normalisation en hauteur qui ecrasait la morphologie.
export const IMPORTED_WIDTH_FILL = 0.9;
export const IMPORTED_HEIGHT_FILL = 0.82;

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
  /** Libere geometries, materiaux, textures, mixer, VRM et renderer. */
  dispose: () => void;
};

/**
 * Echelle uniforme du cadrage par empreinte (reproduction du /hologram
 * Desktop, `computeModelFramingByFootprint`) : le plus petit ratio fait foi,
 * si bien que le modele tient ENTIEREMENT dans le rectangle de reference
 * (insere 0.9/0.82). Les proportions natives sont preservees : un modele
 * large/plat reste plat (contraint en largeur), un petit reste petit.
 */
export function computeFootprintScale(
  nativeWidth: number,
  nativeHeight: number,
  referenceWidth: number,
  referenceHeight: number
): number {
  const candidates = [
    nativeWidth > 0 ? (referenceWidth * IMPORTED_WIDTH_FILL) / nativeWidth : 1,
    nativeHeight > 0
      ? (referenceHeight * IMPORTED_HEIGHT_FILL) / nativeHeight
      : 1,
  ];
  return Math.min(...candidates);
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

/** Baseline d'une scene parse : boite englobante normalisee (lobster). */
export type VrmBaseline = {
  /** Hauteur debout (bboxSize.y). */
  height: number;
  /** Largeur native (bboxSize.x) — composante d'empreinte du cadrage. */
  width: number;
  /** Demi-plus-grand-axe de la bbox (cadrage camera, bras inclus). */
  halfMaxDim: number;
  /** Centre de la bbox — cible camera ET alignement du modele affiche. */
  center: { x: number; y: number; z: number };
  /** Pieds (bbox.min.y) — ancre de l'alcove. */
  minY: number;
};

/** Fallback si la mesure du lobster echoue (buffer illisible). */
const FALLBACK_BASELINE: VrmBaseline = {
  height: TARGET_VRM_HEIGHT,
  width: TARGET_VRM_HEIGHT,
  halfMaxDim: TARGET_VRM_HEIGHT / 2,
  center: { x: 0, y: TARGET_VRM_HEIGHT / 2, z: 0 },
  minY: 0,
};

function sceneBaseline(scene: THREE.Object3D): VrmBaseline | null {
  const box = new THREE.Box3().setFromObject(scene);
  const size = box.getSize(new THREE.Vector3());
  const maxDim = Math.max(size.x, size.y, size.z);
  if (!(size.y > 0) || !(maxDim > 0)) return null;
  const center = box.getCenter(new THREE.Vector3());
  return {
    height: size.y,
    width: size.x,
    halfMaxDim: maxDim / 2,
    center: { x: center.x, y: center.y, z: center.z },
    minY: box.min.y,
  };
}

// --- Calibration baseline (bundle lobster, une fois par session) ----------
// Etat MODULE : le buffer bundle et sa baseline (boite entiere) vivent une
// fois par session d'app. Le lobster n'est JAMAIS rescale : sa bbox EST le
// cadrage de reference. Tout autre VRM est (1) normalise a sa hauteur puis
// (2) translate pour que son centre coincide avec celui du lobster — la
// camera et l'alcove deviennent des constantes absolues, independantes du
// modele affiche (incidents 15/09 v1..v4 : toute mesure du VRM affiche
// faisait varier le zoom/le calage).

let bundledVrmBufferPromise: Promise<ArrayBuffer> | null = null;
let bundledVrmBaseline: VrmBaseline | null = null;

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
 * Mesure la baseline d'un VRM depuis son buffer : parse jetable (geometrie
 * disposee, aucun rendu), `rotateVRM0` avant la mesure (meme ordre que le
 * pipeline, hauteur stable sur Y). Echec de parse -> null.
 */
export async function measureVrmBaseline(
  buffer: ArrayBuffer,
  parse: (buffer: ArrayBuffer) => Promise<ParsedVrmScene> = parseVrmForMeasure
): Promise<VrmBaseline | null> {
  let parsed: ParsedVrmScene;
  try {
    parsed = await parse(buffer);
  } catch {
    return null;
  }
  if (parsed.vrm) VRMUtils.rotateVRM0(parsed.vrm);
  const baseline = sceneBaseline(parsed.scene);
  disposeSceneResources(parsed.scene);
  void (parsed.vrm as unknown as { dispose?: () => void } | null)?.dispose?.();
  return baseline;
}

/**
 * Resout la baseline de cadrage (cache module, une mesure par session) :
 * - bundle affiche : sa bbox native mesuree devient la reference (echelle 1) ;
 * - resident affiche : cache si present, sinon mesure PARESSEUSE du buffer
 *   bundle ; echec -> fallback (cache non pollue, retentee au reload) ;
 * - retourne TOUJOURS une baseline (jamais null).
 */
export async function resolveVrmBaseline(input: {
  isBundledVrm: boolean;
  nativeBaseline?: VrmBaseline | null;
  bundledVrm?: ArrayBuffer;
  parse?: (buffer: ArrayBuffer) => Promise<ParsedVrmScene>;
}): Promise<VrmBaseline> {
  if (input.isBundledVrm && input.nativeBaseline) {
    bundledVrmBaseline = input.nativeBaseline;
  } else if (bundledVrmBaseline === null && input.bundledVrm) {
    const measured = await measureVrmBaseline(input.bundledVrm, input.parse);
    if (measured !== null) {
      bundledVrmBaseline = measured;
    }
  }
  return bundledVrmBaseline ?? FALLBACK_BASELINE;
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

/** Tests : vide la calibration module (buffer cache + baseline mesuree). */
export function resetVrmCalibration(): void {
  bundledVrmBufferPromise = null;
  bundledVrmBaseline = null;
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
  // Baseline de cadrage (boite du lobster, mesuree une fois par session) :
  // hauteur de normalisation + centre/pieds de reference pour la camera et
  // l'alcove. Initialisee au fallback, affinee dans le callback de parse.
  let baseline: VrmBaseline = FALLBACK_BASELINE;
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
        // Calibration 15/09 v2/v3 : cible = hauteur native du bundle lobster
        // (baseline visuel, alcove a ses unites natives), pas une constante
        // arbitraire. Rotation 0.x d'abord, PUIS mesure/normalisation :
        // sinon la hauteur d'un modele 0.x serait mesuree sur le mauvais axe.
        // v3 : la baseline camera (demi-max-dim du lobster) est mesuree en
        // MEME TEMPS — une seule source de cadrage.
        VRMUtils.rotateVRM0(vrm);
        const vrmIsBundled = buffers.vrm === buffers.bundledVrm;
        const nativeBaseline = vrmIsBundled ? sceneBaseline(vrm.scene) : null;
        baseline = await resolveVrmBaseline(
          vrmIsBundled
            ? { isBundledVrm: true, nativeBaseline }
            : { isBundledVrm: false, bundledVrm: buffers.bundledVrm }
        );
        // Pas de normalisation en hauteur ici : l'echelle est decidee par le
        // cadrage par empreinte (plus bas), qui preserve les proportions.
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
  // Cadrage (incidents 15/09 v1..v5) : reproduction du cadrage par empreinte
  // du /hologram Desktop. Le lobster est la reference (echelle native, camera
  // fixe) ; tout autre VRM est mis a l'echelle UNIFORME pour tenir dans
  // l'empreinte du lobster (inseree 0.9/0.82) — les proportions natives sont
  // preservees, l'alcove suit la meme echelle/position. Camera fixe, aucune
  // mesure du modele affiche dans la distance.
  const nativeBox = new THREE.Box3().setFromObject(vrm.scene);
  const nativeSize = nativeBox.getSize(new THREE.Vector3());
  const nativeCenter = nativeBox.getCenter(new THREE.Vector3());

  const isLobster = buffers.vrm === buffers.bundledVrm;
  const scale = isLobster
    ? 1
    : computeFootprintScale(
        nativeSize.x,
        nativeSize.y,
        baseline.width,
        baseline.height
      );
  vrm.scene.scale.multiplyScalar(scale);

  // Pieds du modele a la hauteur des pieds du lobster, centre X/Z aligne.
  const finalSizeY = nativeSize.y * scale;
  const desiredCenter = new THREE.Vector3(
    baseline.center.x,
    baseline.minY + finalSizeY / 2,
    baseline.center.z
  );
  const scaledCenter = nativeCenter.clone().multiplyScalar(scale);
  const alignOffset = desiredCenter.clone().sub(scaledCenter);
  vrm.scene.position.copy(alignOffset);

  const camCenter = new THREE.Vector3(
    baseline.center.x,
    baseline.center.y,
    baseline.center.z
  );
  const fillDistance =
    baseline.halfMaxDim / Math.tan((camera.fov * Math.PI) / 360);
  camera.position.set(
    camCenter.x,
    camCenter.y + baseline.height * CAM_PIVOT_OFFSET_Y_FACTOR,
    camCenter.z + fillDistance * CAM_FILL_DISTANCE_FACTOR
  );
  camera.lookAt(camCenter);
  // Cadrage de reference : distance et direction figees, le zoom (pose) ne
  // fait que diviser la distance. La camera ne change plus d'orientation.
  const cameraCenter = camCenter.clone();
  const cameraDistance = camera.position.distanceTo(cameraCenter);
  const cameraDirection = camera.position.clone().sub(cameraCenter).normalize();
  // Orientation naturelle du modele (apres correction VRM 0.x) : les yaws
  // de pose sont RELATIFS a cette base (portable sur tout VRM).
  const baseAvatarYaw = vrm.scene.rotation.y;
  // Zoom et profondeur courants (pose) ; bornes partagees avec la validation.
  let zoom = 1;
  let depth = 0;
  // Geste 4.5 : coins de la bbox de l'avatar, projetes a la demande (la zone
  // suit le zoom, contrairement a un cache fige au cadrage initial). La bbox
  // est relevee APRES l'echelle + le positionnement.
  const alignedBox = new THREE.Box3().setFromObject(vrm.scene);
  const bboxCorners: THREE.Vector3[] = [];
  for (const x of [alignedBox.min.x, alignedBox.max.x]) {
    for (const y of [alignedBox.min.y, alignedBox.max.y]) {
      for (const z of [alignedBox.min.z, alignedBox.max.z]) {
        bboxCorners.push(new THREE.Vector3(x, y, z));
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
  // L'alcove suit la MEME echelle/position que le modele cadre (comportement
  // du /hologram Desktop : `environmentScale`/`environmentPosition` =
  // `framing.finalScale`/`finalPosition`). Pour le lobster (scale 1, position
  // 0) l'alcove reste a son echelle native — le ratio d'origine est preserve.
  alcoveScene.scale.setScalar(scale);
  alcoveScene.position.copy(alignOffset);
  scene.add(alcoveScene);

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

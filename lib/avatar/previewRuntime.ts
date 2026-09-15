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
 * Normalise un VRM a `targetHeight` (unites monde) : un seul facteur de
 * scale applique sur la scene, mesure sur la HAUTEUR (bboxSize.y) — pas sur
 * le plus grand axe, sinon un VRM aux bras ecartes serait retreci en
 * hauteur. Mutation en place, idempotente (re-appliquer donne hauteur
 * cible), sans rechargement d'asset. Degenerescences (bbox vide, hauteur
 * nulle ou negative) : no-op securitaire, jamais de crash ni de scale
 * infini.
 */
export function normalizeVrmHeight(
  scene: THREE.Object3D,
  targetHeight: number
): void {
  if (!(targetHeight > 0)) return;
  const box = new THREE.Box3().setFromObject(scene);
  const size = box.getSize(new THREE.Vector3());
  if (!(size.y > 0)) return;
  scene.scale.multiplyScalar(targetHeight / size.y);
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

/** Baseline d'un scene parse : hauteur debout + demi-max-dimension, null si bbox degeneresce. */
function sceneBaseline(
  scene: THREE.Object3D
): { height: number; halfMaxDim: number } | null {
  const box = new THREE.Box3().setFromObject(scene);
  const size = box.getSize(new THREE.Vector3());
  const maxDim = Math.max(size.x, size.y, size.z);
  return size.y > 0 && maxDim > 0
    ? { height: size.y, halfMaxDim: maxDim / 2 }
    : null;
}
// --- Calibration baseline (bundle lobster, une fois par session) ----------
// Etat MODULE : le buffer bundle et sa baseline camera vivent une fois par
// session d'app (un reload runtime ne recharge ni ne remesure rien).

let bundledVrmBufferPromise: Promise<ArrayBuffer> | null = null;
let bundledVrmHeight: number | null = null;
/**
 * Demi-plus-grand-axe de la bbox du lobster parsé (rotateVRM0 appliqué).
 * Deuxième composante de la baseline camera : le lobster n'est JAMAIS
 * rescale, donc sa bbox EST le cadrage baseline (incident 15/09 v3 : toute
 * mesure derivee du VRM affiche fait varier le zoom selon le modele).
 */
let bundledVrmHalfMaxDim: number | null = null;

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
 * disposee, aucun rendu), `rotateVRM0` avant la mesure (même ordre que le
 * pipeline de preview, hauteur stable sur Y). Echec de parse -> null.
 * Renvoie { hauteur debout, demi-max-dimension de la bbox }, les DEUX
 * composantes de la baseline camera (incident 15/09 v3).
 */
export async function measureVrmBaseline(
  buffer: ArrayBuffer,
  parse: (buffer: ArrayBuffer) => Promise<ParsedVrmScene> = parseVrmForMeasure
): Promise<{ height: number; halfMaxDim: number } | null> {
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
 * Resolve la baseline de cadrage (cache module, une mesure par session,
 * aucune mesure par frame) :
 * - le bundle EST affiche : sa bbox native (mesuree du vrm deja parse,
 *   `nativeHeight`/`nativeHalfMaxDim`) devient la reference et est cachee —
 *   echelle 1, cadrage d'origine preserve ;
 * - un resident est affiche : cible = cache si present, sinon mesure
 *   PARESSEUSE du buffer bundle (`bundledVrm`) ; echec -> null (cache non
 *   pollue, la mesure est retentee au prochain reload runtime) ;
 * - sinon fallback historique `TARGET_VRM_HEIGHT` (baseline camera 0.5).
 */
export async function resolveTargetVrmHeight(input: {
  isBundledVrm: boolean;
  /** Hauteur native du vrm affiche quand il EST le bundle (post-rotateVRM0). */
  nativeHeight?: number | null;
  /** Demi-max-dim native du vrm affiche quand il EST le bundle. */
  nativeHalfMaxDim?: number | null;
  /** Buffer bundle en cache, pour la mesure paresseuse si le cache est vide. */
  bundledVrm?: ArrayBuffer;
  parse?: (buffer: ArrayBuffer) => Promise<ParsedVrmScene>;
}): Promise<number> {
  if (input.isBundledVrm) {
    if (input.nativeHeight != null) bundledVrmHeight = input.nativeHeight;
    if (input.nativeHalfMaxDim != null) {
      bundledVrmHalfMaxDim = input.nativeHalfMaxDim;
    }
  } else if (bundledVrmHeight === null && input.bundledVrm) {
    const measured = await measureVrmBaseline(input.bundledVrm, input.parse);
    if (measured !== null) {
      bundledVrmHeight = measured.height;
      bundledVrmHalfMaxDim = measured.halfMaxDim;
    }
  }
  return bundledVrmHeight ?? TARGET_VRM_HEIGHT;
}

/**
 * Baseline camera pour le cadrage (incident 15/09 v3) : la distance est
 * derivee du demi-max-dimension du LOBSTER (cache), jamais du VRM affiche.
 * Fallback : hauteur/2 (VRM supposes normalises a la hauteur cible).
 */
export function resolveBaselineHalfMaxDim(): number {
  return bundledVrmHalfMaxDim ?? bundledVrmHeight ?? TARGET_VRM_HEIGHT / 2;
}

/** Hauteur baseline (lobster) pour les offsets camera — fallback 1.0. */
export function resolveBaselineHeight(): number {
  return bundledVrmHeight ?? TARGET_VRM_HEIGHT;
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
  bundledVrmHeight = null;
  bundledVrmHalfMaxDim = null;
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
        // Calibration 15/09 v2/v3 : cible = hauteur native du bundle lobster
        // (baseline visuel, alcove a ses unites natives), pas une constante
        // arbitraire. Rotation 0.x d'abord, PUIS mesure/normalisation :
        // sinon la hauteur d'un modele 0.x serait mesuree sur le mauvais axe.
        // v3 : la baseline camera (demi-max-dim du lobster) est mesuree en
        // MEME TEMPS — une seule source de cadrage.
        VRMUtils.rotateVRM0(vrm);
        const vrmIsBundled = buffers.vrm === buffers.bundledVrm;
        let nativeBaseline: { height: number; halfMaxDim: number } | null = null;
        if (vrmIsBundled) {
          nativeBaseline = sceneBaseline(vrm.scene);
        }
        const targetVrmHeight = await resolveTargetVrmHeight(
          vrmIsBundled
            ? {
                isBundledVrm: true,
                nativeHeight: nativeBaseline?.height ?? null,
                nativeHalfMaxDim: nativeBaseline?.halfMaxDim ?? null,
              }
            : { isBundledVrm: false, bundledVrm: buffers.bundledVrm }
        );
        // Le bundle lui-meme : scale = target/native = 1 (jamais rescale) ;
        // un resident : porte a la hauteur du lobster.
        normalizeVrmHeight(vrm.scene, targetVrmHeight);
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
  // Cadrage (incident 15/09 v3) : la DISTANCE de camera est figee sur la
  // baseline du lobster (demi-max-dim mesure une fois par session). La bbox
  // du VRM affiche sert UNIQUEMENT au calage en position (alcove, pivot,
  // zone du geste) — plus AUCUN maxDimension mesure par modele dans le
  // cadrage : un VRM aux bras ecartes et un VRM fin sont coupes identiquement.
  const bbox = new THREE.Box3().setFromObject(vrm.scene);
  const bboxCenter = bbox.getCenter(new THREE.Vector3());
  const fillDistance =
    resolveBaselineHalfMaxDim() / Math.tan((camera.fov * Math.PI) / 360);
  camera.position.set(
    bboxCenter.x,
    bboxCenter.y + resolveBaselineHeight() * CAM_PIVOT_OFFSET_Y_FACTOR,
    bboxCenter.z + fillDistance * CAM_FILL_DISTANCE_FACTOR
  );
  camera.lookAt(bboxCenter);
  // Cadrage de reference : distance et direction figees, le zoom (pose) ne
  // fait que diviser la distance. La camera ne change plus d'orientation.
  const cameraCenter = bboxCenter.clone();
  const cameraDistance = camera.position.distanceTo(cameraCenter);
  const cameraDirection = camera.position.clone().sub(cameraCenter).normalize();
  // Orientation naturelle du modele (apres correction VRM 0.x) : les yaws
  // de pose sont RELATIFS a cette base (portable sur tout VRM).
  const baseAvatarYaw = vrm.scene.rotation.y;
  // Zoom et profondeur courants (pose) ; bornes partagees avec la validation.
  let zoom = 1;
  let depth = 0;
  // Geste 4.5 : coins de la bbox de l'avatar, projetes a la demande (la zone
  // suit le zoom, contrairement a un cache fige au cadrage initial).
  const bboxCorners: THREE.Vector3[] = [];
  for (const x of [bbox.min.x, bbox.max.x]) {
    for (const y of [bbox.min.y, bbox.max.y]) {
      for (const z of [bbox.min.z, bbox.max.z]) {
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
  // Positionnement relatif a l'avatar : centre sur la bbox de l'avatar
  // (normalise a la hauteur du bundle, l'echelle de reference visuelle), a
  // l'echelle native de l'alcove (les unites du .glb sont les leurs) — le
  // ratio alcove/avatar est celui du cadrage d'origine du lobster, comme
  // cote Web (`environmentLoader.ts` : "stable size benchmark").
  alcoveScene.position.set(bboxCenter.x, bbox.min.y, bboxCenter.z);
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
    vrm.scene.position.z = depth;
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

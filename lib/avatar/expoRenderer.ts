import * as THREE from "three";
import type { ExpoWebGLRenderingContext } from "expo-gl";

/**
 * Renderer three.js pour le contexte Expo GL (PLAN.md Phase 4).
 *
 * Le `WebGLRenderer` de three attend un canvas DOM ; sous React Native on
 * lui fournit un shim minimal (propre au contexte charge, pas un patch
 * global) : le seul usage requis par three est `width`, `height`,
 * `addEventListener` et `style`. Le contexte WebGL2-like d'expo-gl est
 * passe explicitement via `context`.
 *
 * ponytail: three (>= r163) exige WebGL 2 et le detecte via
 * `gl instanceof WebGL2RenderingContext`. Sous RN la classe globale
 * n'existe pas, meme quand le contexte expo-gl parle l'API WebGL2 —
 * on declare donc le marqueur absent (detection uniquement, la classe est
 * vide). Si three cesse de toucher a `instanceof`, supprimer ce shim.
 */
function ensureWebGL2Marker(): void {
  const globalAny = globalThis as unknown as {
    WebGL2RenderingContext?: new () => unknown;
  };
  if (typeof globalAny.WebGL2RenderingContext === "undefined") {
    globalAny.WebGL2RenderingContext = class WebGL2RenderingContext {};
  }
}

export function createExpoRenderer(
  gl: ExpoWebGLRenderingContext,
  width: number,
  height: number
): THREE.WebGLRenderer {
  ensureWebGL2Marker();
  const fakeCanvas = {
    width,
    height,
    clientWidth: width,
    clientHeight: height,
    style: {},
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  } as unknown as HTMLCanvasElement;

  const renderer = new THREE.WebGLRenderer({
    canvas: fakeCanvas,
    context: gl as unknown as WebGL2RenderingContext,
    antialias: true,
    alpha: true,
  });
  renderer.setPixelRatio(1);
  renderer.setSize(width, height, false);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  return renderer;
}

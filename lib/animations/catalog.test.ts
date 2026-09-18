import { describe, expect, it } from "vitest";
import {
  ANIMATION_CATALOG,
  ANIMATION_FILE_NAME_PATTERN,
  BUNDLED_ANIMATION_FILE_NAME,
  findAnimationEntry,
  isKnownAnimationFileName,
  wakeWordCueAnimationUrlFor,
} from "./catalog";

/**
 * Verrouille le miroir local de `ANIMATION_OPTIONS` (web/electron) : meme
 * ordre, memes libelles, meme URL relative, et une seule entree embarquee
 * (l'idle lue hors ligne). Toute divergence casse l'apercu (mauvaise URL) ou
 * la lecture du bundle.
 */
describe("catalogue d'animations (miroir de ANIMATION_OPTIONS)", () => {
  it("expose les 20 animations, Idle en tete et seule embarquee", () => {
    expect(ANIMATION_CATALOG).toHaveLength(20);
    expect(ANIMATION_CATALOG[0]).toEqual({
      label: "Idle (default)",
      fileName: "idle_loop.vrma",
      url: "/animations/idle_loop.vrma",
      bundled: true,
    });
    expect(BUNDLED_ANIMATION_FILE_NAME).toBe("idle_loop.vrma");
    expect(ANIMATION_CATALOG.filter((e) => e.bundled).map((e) => e.fileName)).toEqual([
      "idle_loop.vrma",
    ]);
  });

  it("aligne libelles et noms de fichiers sur ANIMATION_OPTIONS", () => {
    expect(ANIMATION_CATALOG.map((e) => e.label)).toEqual([
      "Idle (default)",
      "Greeting",
      "Goodbye",
      "Clapping",
      "Angry",
      "Blush",
      "Jump",
      "Look Around",
      "Model Pose",
      "Peace Sign",
      "Relax",
      "Sad",
      "Shoot",
      "Show Full Body",
      "Sleepy",
      "Spin",
      "Squat",
      "Surprised",
      "Thinking",
      "Walk",
    ]);
    expect(ANIMATION_CATALOG.map((e) => e.fileName)).toEqual([
      "idle_loop.vrma",
      "Greeting.vrma",
      "Goodbye.vrma",
      "Clapping.vrma",
      "Angry.vrma",
      "Blush.vrma",
      "Jump.vrma",
      "LookAround.vrma",
      "ModelPose.vrma",
      "PeaceSign.vrma",
      "Relax.vrma",
      "Sad.vrma",
      "Shoot.vrma",
      "ShowFullBody.vrma",
      "Sleepy.vrma",
      "Spin.vrma",
      "Squat.vrma",
      "Surprised.vrma",
      "Thinking.vrma",
      "walk.vrma",
    ]);
  });

  it("derive l'URL du nom de fichier, tous sous /animations/", () => {
    for (const entry of ANIMATION_CATALOG) {
      expect(entry.url).toBe(`/animations/${entry.fileName}`);
      expect(entry.fileName).toMatch(ANIMATION_FILE_NAME_PATTERN);
    }
  });
});

describe("wakeWordCueAnimationUrlFor (selection de cue depuis le preview)", () => {
  it("persiste l'URL d'une animation non-idle", () => {
    const greeting = findAnimationEntry("Greeting.vrma");
    expect(greeting).toBeDefined();
    expect(wakeWordCueAnimationUrlFor(greeting!)).toBe("/animations/Greeting.vrma");
  });

  it("ne persiste rien pour l'idle (aperçu local uniquement)", () => {
    const idle = findAnimationEntry(BUNDLED_ANIMATION_FILE_NAME);
    expect(idle).toBeDefined();
    expect(wakeWordCueAnimationUrlFor(idle!)).toBeNull();
  });
});

describe("findAnimationEntry / isKnownAnimationFileName (garde path traversal)", () => {
  it("retrouve une entree valide", () => {
    expect(findAnimationEntry("Greeting.vrma")?.label).toBe("Greeting");
    expect(isKnownAnimationFileName("idle_loop.vrma")).toBe(true);
    expect(isKnownAnimationFileName("Walk.vrma")).toBe(false);
  });

  it("refuse un nom inconnu ou une traversee", () => {
    expect(findAnimationEntry("../evil.vrma")).toBeUndefined();
    expect(isKnownAnimationFileName("../evil.vrma")).toBe(false);
    expect(isKnownAnimationFileName("a/b.vrma")).toBe(false);
    expect(isKnownAnimationFileName("\\windows\\evil.vrma")).toBe(false);
    expect(isKnownAnimationFileName(".hidden.vrma")).toBe(false);
    expect(isKnownAnimationFileName("Greeting.vrma.txt")).toBe(false);
    expect(isKnownAnimationFileName("idle.vrma")).toBe(false);
  });
});

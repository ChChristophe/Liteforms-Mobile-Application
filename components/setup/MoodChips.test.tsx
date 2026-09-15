import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * MoodChips est un composant RN : le runtime react-native n'existe pas hors
 * RN, on fournit des stubs minimaux (le composant n'est pas rendu ici — les
 * tests ciblent sa logique pure et son chemin d'ecriture au store, comme
 * les autres suites pures du repo).
 */
vi.mock("react-native", () => ({
  Pressable: () => null,
  StyleSheet: { create: <T,>(styles: T): T => styles },
  Text: () => null,
  View: () => null,
}));

vi.mock("../../lib/storage/configStorage", () => ({
  CONFIG_STORAGE_KEY: "liteforms.deviceConfig",
  loadStoredDeviceConfig: vi.fn(),
  saveStoredDeviceConfig: vi.fn().mockResolvedValue(undefined),
  clearStoredDeviceConfig: vi.fn().mockResolvedValue(undefined),
}));

import { saveStoredDeviceConfig } from "../../lib/storage/configStorage";
import { useConfigStore } from "../../stores/configStore";
import { DEFAULT_DEVICE_CONFIG } from "../../lib/config/defaults";
import { AVATAR_MOODS } from "../../types/config";
import { MOOD_LABELS, moodChipDefs } from "./MoodChips";

/**
 * Protege le contrat des chips de mood : le chip « Defaut » correspond
 * toujours a `mood: null` (valeur de contrat, le Desktop choisit), la
 * selection derive uniquement de l'humeur du store (aucun etat local dans
 * le composant), et un appui est modele par `updateAvatar({ mood })` —
 * c'est le chemin reelment debranche par les deux ecrans ambiances et preview.
 */
describe("moodChipDefs", () => {
  it("place « Defaut » en premier avec la valeur nulle du contrat", () => {
    const [defaut, ...moods] = moodChipDefs(null);
    expect(defaut).toEqual({
      value: null,
      label: "Défaut",
      selected: true,
    });
    expect(moods.map((chip) => chip.value)).toEqual([...AVATAR_MOODS]);
    expect(moods.every((chip) => !chip.selected)).toBe(true);
  });

  it("selectionne uniquement le chip correspondant a l'humeur courante", () => {
    const defs = moodChipDefs("angry");
    const selected = defs.filter((chip) => chip.selected);
    expect(selected).toEqual([
      { value: "angry", label: MOOD_LABELS.angry, selected: true },
    ]);
  });

  it("aucun etat local : la selection suit le store a chaque lecture", () => {
    expect(moodChipDefs("happy").every((chip) => chip.selected === (chip.value === "happy"))).toBe(true);
    expect(moodChipDefs(null).every((chip) => chip.selected === (chip.value === null))).toBe(true);
  });
});

describe("chip press -> store", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useConfigStore.setState({ config: DEFAULT_DEVICE_CONFIG, hydrated: false });
  });

  it("un appui de mood ecrit updateAvatar({ mood }) dans le store", () => {
    useConfigStore.getState().updateAvatar({ mood: "relaxed" });
    expect(useConfigStore.getState().config.avatar.mood).toBe("relaxed");
    expect(saveStoredDeviceConfig).toHaveBeenCalledTimes(1);
  });

  it("l'appui du chip « Defaut » ecrit null (le Desktop choisit)", () => {
    useConfigStore.getState().updateAvatar({ mood: "sad" });
    useConfigStore.getState().updateAvatar({ mood: null });
    expect(useConfigStore.getState().config.avatar.mood).toBeNull();
  });
});

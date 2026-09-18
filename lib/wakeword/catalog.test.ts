import { describe, expect, it } from "vitest";
import { WAKE_WORD_MODEL_IDS } from "../../types/config";
import { WAKE_WORD_LABELS, WAKE_WORD_MODELS, wakeWordLabel } from "./catalog";

describe("wake word catalog", () => {
  it("expose les quatre modeles de l'appliance, dans l'ordre du contrat", () => {
    expect(WAKE_WORD_MODELS.map((entry) => entry.id)).toEqual([...WAKE_WORD_MODEL_IDS]);
    expect(WAKE_WORD_MODELS.every((entry) => entry.phrase.length > 0)).toBe(true);
  });

  it("aligne libelles et phrases sur l'appliance", () => {
    expect(WAKE_WORD_LABELS.hey_jarvis).toBe("Hey Jarvis");
    expect(WAKE_WORD_LABELS.alexa).toBe("Alexa");
    expect(WAKE_WORD_LABELS.hey_mycroft).toBe("Hey Mycroft");
    expect(WAKE_WORD_LABELS.hey_rhasspy).toBe("Hey Rhasspy");
  });

  it("affiche « Aucun » quand aucun wake word n'est selectionne", () => {
    expect(wakeWordLabel(null)).toBe("Aucun");
    expect(wakeWordLabel("hey_jarvis")).toBe("Hey Jarvis");
  });
});

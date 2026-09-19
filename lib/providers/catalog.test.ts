import { describe, expect, it } from "vitest";
import {
  LLM_PROVIDERS,
  STT_PROVIDERS,
  TTS_PROVIDERS,
  findCatalogEntry,
  findProviderEntry,
  providerLabel,
  providerRequiresKey,
  providerSlotDisplay,
} from "./catalog";
import { isRealtimeVoiceProvider } from "../../types/config";

describe("catalog.requiresKey", () => {
  it("expose requiresKey sur chaque entree visible", () => {
    for (const entry of [...LLM_PROVIDERS, ...TTS_PROVIDERS, ...STT_PROVIDERS]) {
      expect(typeof entry.requiresKey).toBe("boolean");
    }
  });

  it("marque les LLM cloud a cle", () => {
    expect(providerRequiresKey("openai")).toBe(true);
    expect(providerRequiresKey("anthropic")).toBe(true);
    expect(providerRequiresKey("google")).toBe(true);
    expect(providerRequiresKey("google-live")).toBe(true);
    expect(providerRequiresKey("openai-realtime")).toBe(true);
    expect(providerRequiresKey("openrouter")).toBe(true);
  });

  it("n'exige pas de cle pour openai-codex (appairage) ni openclaw (token appliance)", () => {
    expect(providerRequiresKey("openai-codex")).toBe(false);
    expect(providerRequiresKey("openclaw")).toBe(false);
  });

  it("marque les TTS/STT a cle", () => {
    expect(providerRequiresKey("elevenlabs")).toBe(true);
    expect(providerRequiresKey("deepgram")).toBe(true);
  });

  it("resolve un provider par id tous slots confondus (dedup openai)", () => {
    expect(findProviderEntry("openai")?.requiresKey).toBe(true);
    expect(providerRequiresKey("unknown-provider")).toBe(false);
  });
});

describe("detection realtime", () => {
  it("reconnait les deux providers a voix entree+sortie", () => {
    expect(isRealtimeVoiceProvider("openai-realtime")).toBe(true);
    expect(isRealtimeVoiceProvider("google-live")).toBe(true);
  });

  it("n'inclut pas les LLM classiques ni la sentinelle", () => {
    for (const id of ["openai", "google", "anthropic", "openclaw", "none"]) {
      expect(isRealtimeVoiceProvider(id)).toBe(false);
    }
  });
});

describe("catalog.speedRange", () => {
  it("declare les plages validees du contrat (LLM realtime + TTS)", () => {
    expect(findCatalogEntry(LLM_PROVIDERS, "openai-realtime")?.speedRange).toEqual({
      min: 0.25,
      max: 1.5,
    });
    expect(findCatalogEntry(TTS_PROVIDERS, "openai")?.speedRange).toEqual({
      min: 0.25,
      max: 4,
    });
    expect(findCatalogEntry(TTS_PROVIDERS, "elevenlabs")?.speedRange).toEqual({
      min: 0.7,
      max: 1.2,
    });
  });

  it("n'expose aucune plage sur google-live, les LLM non-realtime et les STT", () => {
    expect(findCatalogEntry(LLM_PROVIDERS, "google-live")?.speedRange).toBeUndefined();
    expect(findCatalogEntry(LLM_PROVIDERS, "openai")?.speedRange).toBeUndefined();
    expect(findCatalogEntry(TTS_PROVIDERS, "google")?.speedRange).toBeUndefined();
    expect(findCatalogEntry(TTS_PROVIDERS, "deepgram")?.speedRange).toBeUndefined();
    for (const entry of STT_PROVIDERS) {
      expect(entry.speedRange).toBeUndefined();
    }
  });
});

describe("providerSlotDisplay (review)", () => {
  it("affiche la vitesse TTS quand elle est reglee (non nulle)", () => {
    const tts = {
      provider: "openai",
      model: "gpt-4o-mini-tts",
      endpoint: null,
      voiceId: "coral",
      speed: 1.5,
    };
    expect(providerSlotDisplay("tts", tts, "openai")).toBe(
      "openai · gpt-4o-mini-tts — voix coral — vitesse 1.5"
    );
  });

  it("affiche la vitesse de la voix d'un LLM realtime quand elle est reglee", () => {
    const llm = {
      provider: "openai-realtime",
      model: "gpt-realtime-2",
      endpoint: null,
      voiceId: "coral",
      speed: 1.25,
    };
    expect(providerSlotDisplay("llm", llm, "openai-realtime")).toBe(
      "openai-realtime · gpt-realtime-2 — voix coral — vitesse 1.25"
    );
  });

  it("n'affiche rien pour une vitesse nulle (defaut du provider)", () => {
    const tts = {
      provider: "elevenlabs",
      model: "eleven_flash_v2_5",
      endpoint: null,
      voiceId: null,
      speed: null,
    };
    expect(providerSlotDisplay("tts", tts, "openai")).toBe(
      "elevenlabs · eleven_flash_v2_5"
    );
  });

  it("affiche TTS/STT « Inclus dans <label LLM> » quand le LLM est realtime", () => {
    const tts = { provider: "none", model: "", endpoint: null, voiceId: null };
    const label = providerLabel("openai-realtime");
    expect(providerSlotDisplay("tts", tts, "openai-realtime")).toBe(`Inclus dans ${label}`);
    expect(providerSlotDisplay("stt", tts, "google-live")).toBe(
      `Inclus dans ${providerLabel("google-live")}`
    );
  });

  it("affiche le detail provider · modele · voix hors realtime", () => {
    const llm = { provider: "openai-realtime", model: "gpt-realtime-2", endpoint: null, voiceId: "coral" };
    expect(providerSlotDisplay("llm", llm, "openai-realtime")).toBe(
      "openai-realtime · gpt-realtime-2 — voix coral"
    );
  });

  it("signale la sentinelle quand le slot n'est pas configure et hors realtime", () => {
    const none = { provider: "none", model: "", endpoint: null, voiceId: null };
    expect(providerSlotDisplay("tts", none, "openai")).toBe("Non configuré");
    expect(providerSlotDisplay("llm", none, "none")).toBe("Non configuré");
  });
});

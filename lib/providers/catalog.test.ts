import { describe, expect, it } from "vitest";
import {
  LLM_PROVIDERS,
  STT_PROVIDERS,
  TTS_PROVIDERS,
  findProviderEntry,
  providerRequiresKey,
} from "./catalog";

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

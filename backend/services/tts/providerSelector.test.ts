import { beforeEach, describe, expect, it, vi } from "vitest";
import type { TtsProvider, TtsRequest, TtsProviderName } from "./types.js";

const { getProvidersMock } = vi.hoisted(() => ({
  getProvidersMock: vi.fn(),
}));

vi.mock("./providers/registry.js", () => ({
  getProviders: getProvidersMock,
}));

import { selectProvider } from "./providerSelector.js";

function req(overrides: Partial<TtsRequest> = {}): TtsRequest {
  return {
    text: "Hello",
    textType: "text",
    voiceId: "alloy",
    engine: "default",
    outputFormat: "wav",
    languageCode: null,
    ...overrides,
  };
}

function provider(name: TtsProviderName, supports = true): TtsProvider {
  return {
    name,
    supports: vi.fn(() => supports),
    synthesize: vi.fn(),
  };
}

describe("providerSelector", () => {
  beforeEach(() => {
    getProvidersMock.mockReset();
  });

  it("uses provider prefix from voiceId and strips prefix", () => {
    const kokoro = provider("kokoro");
    const openai = provider("openai");
    getProvidersMock.mockReturnValue(
      new Map([
        ["kokoro", kokoro],
        ["openai", openai],
      ]),
    );

    const out = selectProvider(req({ voiceId: "kokoro:af_heart" }));
    expect(out.provider).toBe(kokoro);
    expect(out.effectiveReq.voiceId).toBe("af_heart");
    expect(out.effectiveReq.provider).toBe("kokoro");
  });

  it("prefers explicit req.provider over voice prefix", () => {
    const kokoro = provider("kokoro");
    const openai = provider("openai");
    getProvidersMock.mockReturnValue(
      new Map([
        ["kokoro", kokoro],
        ["openai", openai],
      ]),
    );

    const out = selectProvider(req({ provider: "openai", voiceId: "kokoro:af_heart" }));
    expect(out.provider).toBe(openai);
    expect(out.effectiveReq.provider).toBe("openai");
    expect(out.effectiveReq.voiceId).toBe("af_heart");
  });

  it("throws for unknown explicit provider", () => {
    const kokoro = provider("kokoro");
    getProvidersMock.mockReturnValue(new Map([["kokoro", kokoro]]));

    expect(() => selectProvider(req({ provider: "openai" }))).toThrow(
      "Unknown TTS provider: openai",
    );
  });

  it("throws when explicit provider does not support request", () => {
    const kokoro = provider("kokoro", false);
    getProvidersMock.mockReturnValue(new Map([["kokoro", kokoro]]));

    expect(() => selectProvider(req({ provider: "kokoro" }))).toThrow(
      "Provider kokoro does not support this request",
    );
  });

  it("uses default provider order and falls back to openai", () => {
    const kokoro = provider("kokoro", false);
    const openai = provider("openai", true);
    getProvidersMock.mockReturnValue(
      new Map([
        ["kokoro", kokoro],
        ["openai", openai],
      ]),
    );

    const out = selectProvider(req());
    expect(out.provider).toBe(openai);
  });

  it("throws when no provider supports request", () => {
    const kokoro = provider("kokoro", false);
    const openai = provider("openai", false);
    getProvidersMock.mockReturnValue(
      new Map([
        ["kokoro", kokoro],
        ["openai", openai],
      ]),
    );

    expect(() => selectProvider(req())).toThrow("No TTS provider supports this request");
  });
});

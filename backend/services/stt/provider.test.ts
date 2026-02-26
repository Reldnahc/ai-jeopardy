import { beforeEach, describe, expect, it, vi } from "vitest";

const { OpenAiCtor, WhisperCtor, envMock } = vi.hoisted(() => ({
  OpenAiCtor: vi.fn(function OpenAiSttProviderMock(this: Record<string, unknown>) {
    this.kind = "openai";
  }),
  WhisperCtor: vi.fn(function WhisperSttProviderMock(
    this: Record<string, unknown>,
    baseUrl: string,
  ) {
    this.kind = "whisper";
    this.baseUrl = baseUrl;
  }),
  envMock: { WHISPER_URL: "" },
}));

vi.mock("./providers/openai.js", () => ({
  OpenAiSttProvider: OpenAiCtor,
}));

vi.mock("./providers/whisper.js", () => ({
  WhisperSttProvider: WhisperCtor,
}));

vi.mock("../../config/env.js", () => ({
  env: envMock,
}));

import { getSttProvider } from "./provider.js";

describe("stt/provider", () => {
  beforeEach(() => {
    OpenAiCtor.mockClear();
    WhisperCtor.mockClear();
    envMock.WHISPER_URL = "";
  });

  it("returns whisper provider when requested and WHISPER_URL is configured", () => {
    envMock.WHISPER_URL = "http://whisper.local";

    const out = getSttProvider("whisper");

    expect(WhisperCtor).toHaveBeenCalledWith("http://whisper.local");
    expect((out as unknown as { kind: string }).kind).toBe("whisper");
  });

  it("falls back to openai when whisper is requested but WHISPER_URL is missing", () => {
    const out = getSttProvider("whisper");

    expect(OpenAiCtor).toHaveBeenCalledTimes(1);
    expect((out as unknown as { kind: string }).kind).toBe("openai");
  });

  it("returns openai provider for explicit openai", () => {
    envMock.WHISPER_URL = "http://whisper.local";

    const out = getSttProvider("openai");

    expect(OpenAiCtor).toHaveBeenCalledTimes(1);
    expect(WhisperCtor).not.toHaveBeenCalled();
    expect((out as unknown as { kind: string }).kind).toBe("openai");
  });
});

import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SttProvider } from "./types.js";

const { getSttProviderMock, buildPromptMock, rethrowAsSttErrorMock } = vi.hoisted(() => ({
  getSttProviderMock: vi.fn(),
  buildPromptMock: vi.fn(),
  rethrowAsSttErrorMock: vi.fn((err: unknown) => {
    throw err instanceof Error ? err : new Error("wrapped");
  }),
}));

vi.mock("./provider.js", () => ({
  getSttProvider: getSttProviderMock,
}));

vi.mock("./prompt.js", () => ({
  buildExpectedAnswerPrompt: buildPromptMock,
}));

vi.mock("./providers/openai.js", () => ({
  rethrowAsSttError: rethrowAsSttErrorMock,
}));

import { transcribeAnswerAudio } from "./sttService.js";

class TestProvider implements SttProvider {
  probe = vi.fn();
  transcribe = vi.fn();
}

class OpenAiSttProvider extends TestProvider {}

describe("sttService", () => {
  beforeEach(() => {
    getSttProviderMock.mockReset();
    buildPromptMock.mockReset();
    rethrowAsSttErrorMock.mockClear();
  });

  it("throws on missing/empty buffer", async () => {
    await expect(
      transcribeAnswerAudio(Buffer.alloc(0), "audio/webm", null, "openai"),
    ).rejects.toThrow("missing/empty buffer");
  });

  it("returns empty string when probe says no speech/comprehension", async () => {
    const p = new TestProvider();
    p.probe.mockResolvedValue({ text: "???", hasSpeech: false, looksComprehensible: false });
    getSttProviderMock.mockReturnValue(p);
    buildPromptMock.mockReturnValue("hint");

    const out = await transcribeAnswerAudio(Buffer.from("x"), "audio/webm", "ctx", "openai");
    expect(out).toBe("");
    expect(p.transcribe).not.toHaveBeenCalled();
  });

  it("returns probe text when prompt is missing", async () => {
    const p = new TestProvider();
    p.probe.mockResolvedValue({ text: "hello", hasSpeech: true, looksComprehensible: true });
    getSttProviderMock.mockReturnValue(p);
    buildPromptMock.mockReturnValue(undefined);

    const out = await transcribeAnswerAudio(Buffer.from("x"), "audio/webm", null, "openai");
    expect(out).toBe("hello");
    expect(p.transcribe).not.toHaveBeenCalled();
  });

  it("runs biased pass when prompt exists and probe is valid", async () => {
    const p = new TestProvider();
    p.probe.mockResolvedValue({ text: "probe", hasSpeech: true, looksComprehensible: true });
    p.transcribe.mockResolvedValue("biased");
    getSttProviderMock.mockReturnValue(p);
    buildPromptMock.mockReturnValue("Expected answer hint");

    const out = await transcribeAnswerAudio(Buffer.from("x"), "audio/webm", ["Jupiter"], "openai");
    expect(out).toBe("biased");
    expect(p.transcribe).toHaveBeenCalledWith(
      expect.objectContaining({
        language: "en",
        prompt: "Expected answer hint",
        mimeType: "audio/webm",
      }),
    );
  });

  it("uses openai-specific error rethrow path for OpenAiSttProvider", async () => {
    const p = new OpenAiSttProvider();
    p.probe.mockRejectedValue(new Error("boom"));
    getSttProviderMock.mockReturnValue(p);
    buildPromptMock.mockReturnValue(undefined);

    await expect(
      transcribeAnswerAudio(Buffer.from("x"), "audio/webm", null, "openai"),
    ).rejects.toThrow("boom");
    expect(rethrowAsSttErrorMock).toHaveBeenCalledTimes(1);
  });

  it("rethrows original error for non-openai providers", async () => {
    const p = new TestProvider();
    const err = new Error("probe failed");
    p.probe.mockRejectedValue(err);
    getSttProviderMock.mockReturnValue(p);
    buildPromptMock.mockReturnValue(undefined);

    await expect(
      transcribeAnswerAudio(Buffer.from("x"), "audio/webm", null, "whisper"),
    ).rejects.toBe(err);
    expect(rethrowAsSttErrorMock).not.toHaveBeenCalled();
  });
});

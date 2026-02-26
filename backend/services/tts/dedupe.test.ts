import { describe, expect, it } from "vitest";
import type { TtsRequest } from "./types.js";
import { hashForRequest, normalizeText, ttsDedupeHash } from "./dedupe.js";

describe("tts dedupe", () => {
  it("normalizeText collapses whitespace and trims", () => {
    expect(normalizeText("  hello   world \r\n\r\n\r\nnext\tline  ")).toBe(
      "hello world \n\nnext line",
    );
    expect(normalizeText(null)).toBe("");
  });

  it("ttsDedupeHash is stable for equivalent text formatting", () => {
    const base = {
      provider: "openai" as const,
      textType: "text",
      voiceId: "alloy",
      engine: "gpt-4o-mini-tts",
      outputFormat: "mp3",
      languageCode: "en-US" as string | null,
    };

    const a = ttsDedupeHash({ ...base, text: "hello   world\r\n\r\n\r\nnext line" });
    const b = ttsDedupeHash({ ...base, text: " hello world\n\nnext line " });
    expect(a).toBe(b);
  });

  it("ttsDedupeHash changes when a dedupe-significant field changes", () => {
    const payload = {
      provider: "openai" as const,
      text: "hello",
      textType: "text",
      voiceId: "alloy",
      engine: "gpt-4o-mini-tts",
      outputFormat: "mp3",
      languageCode: null as string | null,
    };

    const baseHash = ttsDedupeHash(payload);
    const changedProvider = ttsDedupeHash({ ...payload, provider: "kokoro" });
    expect(baseHash).not.toBe(changedProvider);
  });

  it("hashForRequest matches direct ttsDedupeHash mapping", () => {
    const req: TtsRequest = {
      text: "What is Jupiter?",
      textType: "text",
      voiceId: "alloy",
      engine: "gpt-4o-mini-tts",
      outputFormat: "wav",
      languageCode: null,
    };

    const fromReq = hashForRequest(req, "openai");
    const direct = ttsDedupeHash({
      provider: "openai",
      text: req.text,
      textType: req.textType,
      voiceId: req.voiceId,
      engine: req.engine,
      outputFormat: req.outputFormat,
      languageCode: req.languageCode,
    });
    expect(fromReq).toBe(direct);
  });
});

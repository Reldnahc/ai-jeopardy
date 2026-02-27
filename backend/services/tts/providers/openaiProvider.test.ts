import { beforeEach, describe, expect, it, vi } from "vitest";

const { createSpeechMock, arrayBufferMock } = vi.hoisted(() => ({
  arrayBufferMock: vi.fn(async () => new Uint8Array([1, 2, 3]).buffer),
  createSpeechMock: vi.fn(async () => ({
    arrayBuffer: arrayBufferMock,
  })),
}));

vi.mock("openai", () => ({
  default: class OpenAI {
    audio = {
      speech: {
        create: createSpeechMock,
      },
    };
  },
}));

import { openaiProvider } from "./openaiProvider.js";

describe("openaiProvider", () => {
  beforeEach(() => {
    createSpeechMock.mockClear();
    arrayBufferMock.mockClear();
  });

  it("supports text input for wav and mp3", () => {
    expect(
      openaiProvider.supports({
        text: "Hello",
        textType: "text",
        voiceId: "alloy",
        engine: "default",
        outputFormat: "wav",
        languageCode: null,
      }),
    ).toBe(true);
    expect(
      openaiProvider.supports({
        text: "Hello",
        textType: "text",
        voiceId: "alloy",
        engine: "default",
        outputFormat: "mp3",
        languageCode: null,
      }),
    ).toBe(true);
  });

  it("rejects ssml requests", () => {
    expect(
      openaiProvider.supports({
        text: "Hello",
        textType: "ssml",
        voiceId: "alloy",
        engine: "default",
        outputFormat: "wav",
        languageCode: null,
      }),
    ).toBe(false);
  });

  it("uses default model and strips openai: voice prefix", async () => {
    const out = await openaiProvider.synthesize({
      text: "Say hello",
      textType: "text",
      voiceId: "openai:alloy",
      engine: "default",
      outputFormat: "wav",
      languageCode: null,
    });

    expect(createSpeechMock).toHaveBeenCalledWith({
      model: "gpt-4o-mini-tts",
      voice: "alloy",
      input: "Say hello",
      response_format: "wav",
      speed: undefined,
    });
    expect(Buffer.isBuffer(out.audioBuffer)).toBe(true);
    expect(out.audioBuffer.length).toBe(3);
  });

  it("uses custom engine when provided", async () => {
    await openaiProvider.synthesize({
      text: "Say hello",
      textType: "text",
      voiceId: "nova",
      engine: "gpt-4o-audio-preview",
      outputFormat: "mp3",
      languageCode: null,
    });

    expect(createSpeechMock).toHaveBeenCalledWith(
      expect.objectContaining({
        model: "gpt-4o-audio-preview",
        voice: "nova",
        response_format: "mp3",
        speed: undefined,
      }),
    );
  });

  it("parses speed suffix from openai voice id", async () => {
    await openaiProvider.synthesize({
      text: "Fast hello",
      textType: "text",
      voiceId: "openai:alloy@1.25",
      engine: "default",
      outputFormat: "mp3",
      languageCode: null,
    });

    expect(createSpeechMock).toHaveBeenCalledWith(
      expect.objectContaining({
        voice: "alloy",
        speed: 1.25,
      }),
    );
  });

  it("wraps OpenAI API errors with status and request id", async () => {
    createSpeechMock.mockRejectedValueOnce({
      status: 401,
      message: "invalid api key",
      request_id: "req_123",
    });

    await expect(
      openaiProvider.synthesize({
        text: "Say hello",
        textType: "text",
        voiceId: "alloy",
        engine: "default",
        outputFormat: "wav",
        languageCode: null,
      }),
    ).rejects.toThrow("OpenAI TTS failed: status=401 message=invalid api key request_id=req_123");
  });
});

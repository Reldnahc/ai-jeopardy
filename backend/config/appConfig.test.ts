import { afterEach, describe, expect, it, vi } from "vitest";

const baseEnv = {
  PORT: 3002,
  CORS_ORIGINS: ["http://localhost:5173"],
  OPENAI_API_KEY: "openai-key",
  ANTHROPIC_API_KEY: "",
  DEEPSEEK_API_KEY: "",
  OPENAI_DEFAULT_MODEL: "gpt-4o-mini",
  AI_JUDGE_MODEL: "deepseek-chat",
  KOKORO_URL: "",
  WHISPER_URL: "",
  OPENAI_STT_MODEL: "gpt-4o-mini-transcribe",
  OPENAI_IMAGE_JUDGE_MODEL: "gpt-4.1-mini",
  OPENAI_COTD_MODEL: "gpt-4o-mini",
  BUZZ_LOCKOUT_MS: 1,
  CLUE_ANSWER_TIMEOUT_MS: 10000,
  FINAL_DRAW_SECONDS: 30,
  FINAL_WAGER_SECONDS: 30,
};

async function loadAppConfig(whisperUrl: string, kokoroUrl = "") {
  vi.resetModules();
  vi.doMock("./env.js", () => ({
    env: { ...baseEnv, WHISPER_URL: whisperUrl, KOKORO_URL: kokoroUrl },
  }));
  const mod = await import("./appConfig.js");
  return mod.appConfig;
}

afterEach(() => {
  vi.resetModules();
  vi.doUnmock("./env.js");
});

describe("appConfig", () => {
  it("selects whisper as default stt provider when whisper url is configured", async () => {
    const appConfig = await loadAppConfig("http://whisper.local");
    expect(appConfig.ai.defaultSttProvider).toBe("whisper");
  });

  it("falls back to openai as default stt provider when whisper url is empty", async () => {
    const appConfig = await loadAppConfig("");
    expect(appConfig.ai.defaultSttProvider).toBe("openai");
  });

  it("selects kokoro as default tts provider when kokoro url is configured", async () => {
    const appConfig = await loadAppConfig("", "http://kokoro.local");
    expect(appConfig.ai.defaultTtsProvider).toBe("kokoro");
  });

  it("falls back to openai as default tts provider when kokoro url is empty", async () => {
    const appConfig = await loadAppConfig("", "");
    expect(appConfig.ai.defaultTtsProvider).toBe("openai");
  });

  it("surfaces whether Anthropic is configured", async () => {
    vi.resetModules();
    vi.doMock("./env.js", () => ({
      env: { ...baseEnv, ANTHROPIC_API_KEY: "anthropic-key" },
    }));
    const mod = await import("./appConfig.js");
    expect(mod.appConfig.ai.hasAnthropicApiKey).toBe(true);
    expect(mod.appConfig.ai.hasOpenAiApiKey).toBe(true);
  });

  it("surfaces whether DeepSeek is configured", async () => {
    vi.resetModules();
    vi.doMock("./env.js", () => ({
      env: { ...baseEnv, DEEPSEEK_API_KEY: "deepseek-key" },
    }));
    const mod = await import("./appConfig.js");
    expect(mod.appConfig.ai.hasDeepSeekApiKey).toBe(true);
  });

  it("uses the provider-neutral judge model config", async () => {
    vi.resetModules();
    vi.doMock("./env.js", () => ({
      env: { ...baseEnv, AI_JUDGE_MODEL: "deepseek-chat" },
    }));
    const mod = await import("./appConfig.js");
    expect(mod.appConfig.ai.judgeModel).toBe("deepseek-chat");
  });
});

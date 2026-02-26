import { afterEach, describe, expect, it, vi } from "vitest";

const baseEnv = {
  PORT: 3002,
  CORS_ORIGINS: ["http://localhost:5173"],
  OPENAI_DEFAULT_MODEL: "gpt-4o-mini",
  WHISPER_URL: "",
  OPENAI_STT_MODEL: "gpt-4o-mini-transcribe",
  OPENAI_JUDGE_MODEL: "gpt-4o-mini",
  OPENAI_IMAGE_JUDGE_MODEL: "gpt-4.1-mini",
  OPENAI_COTD_MODEL: "gpt-4o-mini",
  BUZZ_LOCKOUT_MS: 1,
  CLUE_ANSWER_TIMEOUT_MS: 10000,
  FINAL_DRAW_SECONDS: 30,
  FINAL_WAGER_SECONDS: 30,
};

async function loadAppConfig(whisperUrl: string) {
  vi.resetModules();
  vi.doMock("./env.js", () => ({
    env: { ...baseEnv, WHISPER_URL: whisperUrl },
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
});

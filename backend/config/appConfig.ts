// backend/config/appConfig.ts
import type { LobbySettings } from "../../shared/types/lobby.js";
import { env } from "./env.js";

type AppConfig = {
  server: {
    port: number;
    corsOrigins: string[];
  };
  ai: {
    defaultGenerationModel: string;
    hasOpenAiApiKey: boolean;
    hasAnthropicApiKey: boolean;
    hasDeepSeekApiKey: boolean;
    hasGeminiApiKey: boolean;
    defaultSttProvider: NonNullable<LobbySettings["sttProviderName"]>;
    defaultTtsProvider: NonNullable<LobbySettings["ttsProviderName"]>;
    sttModel: string;
    judgeModel: string;
    imageJudgeModel: string;
    cotdModel: string;
  };
  gameplay: {
    buzzLockoutMs: number;
    clueAnswerTimeoutMs: number;
    drawSeconds: number;
    finalWagerSeconds: number;
  };
  judging: {
    strictMode: boolean;
  };
};

export const appConfig = Object.freeze({
  server: {
    port: env.PORT,
    corsOrigins: env.CORS_ORIGINS,
  },

  ai: {
    defaultGenerationModel: env.DEFAULT_GENERATION_MODEL,
    hasOpenAiApiKey: Boolean(env.OPENAI_API_KEY),
    hasAnthropicApiKey: Boolean(env.ANTHROPIC_API_KEY),
    hasDeepSeekApiKey: Boolean(env.DEEPSEEK_API_KEY),
    hasGeminiApiKey: Boolean(env.GEMINI_API_KEY),
    defaultSttProvider: env.WHISPER_URL ? "whisper" : "openai",
    defaultTtsProvider: env.KOKORO_URL ? "kokoro" : "openai",
    sttModel: env.STT_MODEL,
    judgeModel: env.JUDGE_MODEL,
    imageJudgeModel: env.IMAGE_JUDGE_MODEL,
    cotdModel: env.COTD_MODEL,
  },

  gameplay: {
    buzzLockoutMs: env.BUZZ_LOCKOUT_MS,
    clueAnswerTimeoutMs: env.CLUE_ANSWER_TIMEOUT_MS,
    drawSeconds: env.FINAL_DRAW_SECONDS,
    finalWagerSeconds: env.FINAL_WAGER_SECONDS,
  },

  judging: {
    strictMode: false,
  },
} satisfies AppConfig);

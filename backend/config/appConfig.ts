// backend/config/appConfig.ts
import { env } from "./env.js";

export const appConfig = Object.freeze({
  server: {
    port: env.PORT,
    corsOrigins: env.CORS_ORIGINS,
  },

  ai: {
    defaultModel: env.OPENAI_DEFAULT_MODEL,
    defaultSttProvider: env.WHISPER_URL ? "whisper" : "openai",
    sttModel: env.OPENAI_STT_MODEL,
    judgeModel: env.OPENAI_JUDGE_MODEL,
    imageJudgeModel: env.OPENAI_IMAGE_JUDGE_MODEL,
    cotdModel: env.OPENAI_COTD_MODEL,
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
});

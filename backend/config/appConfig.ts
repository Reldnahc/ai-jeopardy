// backend/config/appConfig.ts
import { env } from "./env.js";

export const appConfig = Object.freeze({
    server: {
        port: env.PORT,
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
        buzzLockoutMs: 1,
        clueAnswerTimeoutMs: 10000,
        drawSeconds: 30,
    },

    judging: {
        strictMode: false,
    },
});

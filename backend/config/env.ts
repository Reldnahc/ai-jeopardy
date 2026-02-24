// backend/config/env.ts
import "dotenv/config";

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function optionalEnv(name: string, fallback: string): string {
  return process.env[name] ?? fallback;
}

function optionalNumber(name: string, fallback: number): number {
  const v = process.env[name];
  if (!v) return fallback;
  const n = Number(v);
  if (!Number.isFinite(n)) {
    throw new Error(`Environment variable ${name} must be a number`);
  }
  return n;
}

export const env = Object.freeze({
  // required core
  DATABASE_URL: requireEnv("DATABASE_URL"),
  OPENAI_API_KEY: requireEnv("OPENAI_API_KEY"),
  JWT_SECRET: requireEnv("JWT_SECRET"),
  NODE_ENV: requireEnv("NODE_ENV"),

  // local service endpoints
  PIPER_URL: optionalEnv("PIPER_URL", ""),
  KOKORO_URL: optionalEnv("KOKORO_URL", ""),
  WHISPER_URL: optionalEnv("WHISPER_URL", ""),

  // optional external APIs
  BRAVE_API_KEY: optionalEnv("BRAVE_API_KEY", ""),

  // AI models
  OPENAI_DEFAULT_MODEL: optionalEnv("DEFAULT_MODEL", "gpt-4o-mini"),
  OPENAI_JUDGE_MODEL: optionalEnv("OPENAI_JUDGE_MODEL", "gpt-4o-mini"),
  OPENAI_STT_MODEL: optionalEnv("OPENAI_STT_MODEL", "gpt-4o-mini-transcribe"),
  OPENAI_IMAGE_JUDGE_MODEL: optionalEnv("OPENAI_IMAGE_JUDGE_MODEL", "gpt-4.1-mini"),
  OPENAI_COTD_MODEL: optionalEnv("OPENAI_COTD_MODEL", "gpt-4o-mini"),

  // server
  PORT: optionalNumber("PORT", 3002),

  // gameplay
  BUZZ_LOCKOUT_MS: optionalNumber("BUZZ_LOCKOUT_MS", 1),
  CLUE_ANSWER_TIMEOUT_MS: optionalNumber("CLUE_ANSWER_TIMEOUT_MS", 10000),
  FINAL_DRAW_SECONDS: optionalNumber("FINAL_DRAW_SECONDS", 30),
  FINAL_WAGER_SECONDS: optionalNumber("FINAL_WAGER_SECONDS", 30),
});

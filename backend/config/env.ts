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

    DATABASE_URL: requireEnv("DATABASE_URL"),
    OPENAI_API_KEY: requireEnv("OPENAI_API_KEY"),
    JWT_SECRET: requireEnv("JWT_SECRET"),
    PIPER_URL: requireEnv("PIPER_URL"),
    NODE_ENV: requireEnv("NODE_ENV"),

    BRAVE_API_KEY: optionalEnv("BRAVE_API_KEY", ""),
    OPENAI_DEFAULT_MODEL: optionalEnv("DEFAULT_MODEL", "gpt-4o-mini"),
    OPENAI_JUDGE_MODEL: optionalEnv("OPENAI_JUDGE_MODEL", "gpt-4o-mini"),
    OPENAI_IMAGE_JUDGE_MODEL: optionalEnv("OPENAI_IMAGE_JUDGE_MODEL", "gpt-4.1-mini"),
    OPENAI_COTD_MODEL: optionalEnv("OPENAI_COTD_MODEL", "gpt-4o-mini"),
    PORT: optionalNumber("PORT", 3002),
});

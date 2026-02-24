import { afterEach, describe, expect, it, vi } from "vitest";

const ORIGINAL_ENV = { ...process.env };

function setRequiredBaseEnv() {
  process.env.DATABASE_URL = "postgres://test";
  process.env.OPENAI_API_KEY = "key";
  process.env.JWT_SECRET = "secret";
  process.env.NODE_ENV = "test";
}

async function loadEnvModule() {
  vi.resetModules();
  return import("./env.js");
}

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
});

describe("env config", () => {
  it("loads fallback values for optional settings", async () => {
    process.env = {};
    setRequiredBaseEnv();

    const mod = await loadEnvModule();
    expect(mod.env.PORT).toBe(3002);
    expect(mod.env.CORS_ORIGINS.length).toBeGreaterThan(0);
    expect(mod.env.FINAL_DRAW_SECONDS).toBe(30);
    expect(mod.env.FINAL_WAGER_SECONDS).toBe(30);
  });

  it("parses optional csv and number env values", async () => {
    process.env = {};
    setRequiredBaseEnv();
    process.env.PORT = "7777";
    process.env.CORS_ORIGINS = "https://a.com, https://b.com ,";
    process.env.BUZZ_LOCKOUT_MS = "5";

    const mod = await loadEnvModule();
    expect(mod.env.PORT).toBe(7777);
    expect(mod.env.BUZZ_LOCKOUT_MS).toBe(5);
    expect(mod.env.CORS_ORIGINS).toEqual(["https://a.com", "https://b.com"]);
  });

  it("throws when a required env variable is missing", async () => {
    process.env = {};
    process.env.OPENAI_API_KEY = "key";
    process.env.JWT_SECRET = "secret";
    process.env.NODE_ENV = "test";

    await expect(loadEnvModule()).rejects.toThrow("Missing required environment variable: DATABASE_URL");
  });

  it("throws when optional numeric env var is invalid", async () => {
    process.env = {};
    setRequiredBaseEnv();
    process.env.PORT = "not-a-number";

    await expect(loadEnvModule()).rejects.toThrow("Environment variable PORT must be a number");
  });
});

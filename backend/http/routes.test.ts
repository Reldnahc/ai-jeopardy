import express from "express";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

const appConfigMock = vi.hoisted(() => ({
  appConfig: {
    ai: {
      hasAnthropicApiKey: false,
      hasDeepSeekApiKey: false,
    },
  },
}));

vi.mock("../config/appConfig.js", () => appConfigMock);

async function request(app: express.Express, path: string) {
  const server = app.listen(0);
  await new Promise<void>((resolve) => server.once("listening", resolve));
  const addr = server.address();
  if (!addr || typeof addr === "string") throw new Error("No address");
  const res = await fetch(`http://127.0.0.1:${addr.port}${path}`);
  const json = await res.json();
  server.close();
  return { status: res.status, json };
}

beforeEach(() => {
  appConfigMock.appConfig.ai.hasAnthropicApiKey = false;
  appConfigMock.appConfig.ai.hasDeepSeekApiKey = false;
});

afterAll(() => {
  vi.restoreAllMocks();
});

describe("http routes model catalog", () => {
  it("hides Anthropic and DeepSeek models when those providers are unavailable", async () => {
    const { registerHttpRoutes } = await import("./routes.js");
    const app = express();

    registerHttpRoutes(app, process.cwd(), {
      images: {} as never,
      tts: {} as never,
    });

    const out = await request(app, "/api/models");

    expect(out.status).toBe(200);
    expect(out.json.models.every((model: { provider?: string }) => model.provider !== "anthropic")).toBe(
      true,
    );
    expect(out.json.models.every((model: { provider?: string }) => model.provider !== "deepseek")).toBe(
      true,
    );
  });

  it("includes provider models when those providers are available", async () => {
    appConfigMock.appConfig.ai.hasAnthropicApiKey = true;
    appConfigMock.appConfig.ai.hasDeepSeekApiKey = true;

    const { registerHttpRoutes } = await import("./routes.js");
    const app = express();

    registerHttpRoutes(app, process.cwd(), {
      images: {} as never,
      tts: {} as never,
    });

    const out = await request(app, "/api/models");

    expect(out.status).toBe(200);
    expect(out.json.models.some((model: { provider?: string }) => model.provider === "anthropic")).toBe(
      true,
    );
    expect(out.json.models.some((model: { provider?: string }) => model.provider === "deepseek")).toBe(
      true,
    );
  });
});

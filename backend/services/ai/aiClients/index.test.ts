import { beforeEach, describe, expect, it, vi } from "vitest";

const { ctorMock, createMock, anthropicCtorMock, anthropicCreateMock } = vi.hoisted(() => ({
  ctorMock: vi.fn(),
  createMock: vi.fn(async (payload: unknown) => ({ payload })),
  anthropicCtorMock: vi.fn(),
  anthropicCreateMock: vi.fn(async (payload: unknown) => ({ payload })),
}));

vi.mock("../../../config/env.js", () => ({
  env: {
    OPENAI_API_KEY: "openai-key",
    OPENAI_BASE_URL: "https://openai.example",
    ANTHROPIC_API_KEY: "anthropic-key",
    ANTHROPIC_BASE_URL: "https://anthropic.example",
    DEEPSEEK_API_KEY: "deepseek-key",
    DEEPSEEK_BASE_URL: "https://api.deepseek.com",
  },
}));

vi.mock("openai", () => ({
  default: class OpenAI {
    constructor(config?: unknown) {
      ctorMock(config);
    }

    chat = {
      completions: {
        create: createMock,
      },
    };
  },
}));

vi.mock("@anthropic-ai/sdk", () => ({
  default: class Anthropic {
    constructor(config?: unknown) {
      anthropicCtorMock(config);
    }

    messages = {
      create: anthropicCreateMock,
    };
  },
}));

import { callAiJson, parseAiJson, resolveProviderForModel } from "./index.js";

describe("aiClients/index", () => {
  beforeEach(() => {
    ctorMock.mockClear();
    createMock.mockClear();
    anthropicCtorMock.mockClear();
    anthropicCreateMock.mockClear();
  });

  it("parses anthropic text JSON responses", () => {
    const out = parseAiJson<{ ok: boolean }>({
      content: [{ type: "text", text: '{"ok":true}' }],
    });

    expect(out).toEqual({ ok: true });
  });

  it("routes OpenAI models through the OpenAI provider", async () => {
    await callAiJson("gpt-4o-mini", "Hello", { apiKeyOverride: "openai-override" });

    expect(ctorMock).toHaveBeenCalledWith(
      expect.objectContaining({
        apiKey: "openai-override",
        baseURL: "https://openai.example",
      }),
    );
    expect(createMock).toHaveBeenCalledWith(
      expect.objectContaining({
        model: "gpt-4o-mini",
      }),
    );
    expect(anthropicCreateMock).not.toHaveBeenCalled();
  });

  it("routes Anthropic models through the Anthropic provider", async () => {
    await callAiJson("claude-haiku-4-5", "Hello");

    expect(anthropicCtorMock).toHaveBeenCalledWith(
      expect.objectContaining({
        apiKey: "anthropic-key",
        baseURL: "https://anthropic.example",
      }),
    );
    expect(anthropicCreateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        model: "claude-haiku-4-5",
        system: "Return only valid JSON. No markdown.",
      }),
    );
  });

  it("routes DeepSeek models through the OpenAI-compatible DeepSeek provider", async () => {
    await callAiJson("deepseek-chat", "Hello", { apiKeyOverride: "deepseek-override" });

    expect(createMock).toHaveBeenCalledWith(
      expect.objectContaining({
        model: "deepseek-chat",
      }),
    );
    expect(
      ctorMock.mock.calls.some(
        ([config]) =>
          (config as { apiKey?: string; baseURL?: string } | undefined)?.apiKey ===
            "deepseek-override" &&
          (config as { apiKey?: string; baseURL?: string } | undefined)?.baseURL ===
            "https://api.deepseek.com",
      ),
    ).toBe(true);
  });

  it("resolves DeepSeek provider from model name", () => {
    expect(resolveProviderForModel("deepseek-reasoner")).toBe("deepseek");
  });
});

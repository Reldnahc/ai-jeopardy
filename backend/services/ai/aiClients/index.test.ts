import { beforeEach, describe, expect, it, vi } from "vitest";

const { ctorMock, createMock, anthropicCreateMock } = vi.hoisted(() => ({
  ctorMock: vi.fn(),
  createMock: vi.fn(async (payload: unknown) => ({ payload })),
  anthropicCreateMock: vi.fn(async (payload: unknown) => ({ payload })),
}));

vi.mock("../../../config/env.js", () => ({
  env: {
    OPENAI_API_KEY: "openai-key",
    ANTHROPIC_API_KEY: "anthropic-key",
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
    messages = {
      create: anthropicCreateMock,
    };
  },
}));

import { callAiJson, parseAiJson, resolveProviderForModel } from "./index.js";

describe("aiClients/index", () => {
  beforeEach(() => {
    createMock.mockClear();
    anthropicCreateMock.mockClear();
  });

  it("parses anthropic text JSON responses", () => {
    const out = parseAiJson<{ ok: boolean }>({
      content: [{ type: "text", text: '{"ok":true}' }],
    });

    expect(out).toEqual({ ok: true });
  });

  it("routes OpenAI models through the OpenAI provider", async () => {
    await callAiJson("gpt-4o-mini", "Hello");

    expect(createMock).toHaveBeenCalledWith(
      expect.objectContaining({
        model: "gpt-4o-mini",
      }),
    );
    expect(anthropicCreateMock).not.toHaveBeenCalled();
  });

  it("routes Anthropic models through the Anthropic provider", async () => {
    await callAiJson("claude-haiku-4-5", "Hello");

    expect(anthropicCreateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        model: "claude-haiku-4-5",
        system: "Return only valid JSON. No markdown.",
      }),
    );
  });

  it("routes DeepSeek models through the OpenAI-compatible DeepSeek provider", async () => {
    await callAiJson("deepseek-chat", "Hello");

    expect(createMock).toHaveBeenCalledWith(
      expect.objectContaining({
        model: "deepseek-chat",
      }),
    );
    expect(
      ctorMock.mock.calls.some(
        ([config]) =>
          (config as { apiKey?: string; baseURL?: string } | undefined)?.apiKey ===
            "deepseek-key" &&
          (config as { apiKey?: string; baseURL?: string } | undefined)?.baseURL ===
            "https://api.deepseek.com",
      ),
    ).toBe(true);
  });

  it("resolves DeepSeek provider from model name", () => {
    expect(resolveProviderForModel("deepseek-reasoner")).toBe("deepseek");
  });
});

import { beforeEach, describe, expect, it, vi } from "vitest";

const { createMock } = vi.hoisted(() => ({
  createMock: vi.fn(async (payload: unknown) => ({ payload })),
}));

vi.mock("openai", () => ({
  default: class OpenAI {
    chat = {
      completions: {
        create: createMock,
      },
    };
  },
}));

import { callOpenAiJson, parseOpenAiJson } from "./openaiClient.js";

describe("openaiClient", () => {
  beforeEach(() => {
    createMock.mockClear();
  });

  it("parseOpenAiJson parses standard JSON content", () => {
    const out = parseOpenAiJson<{ ok: boolean }>({
      choices: [{ message: { content: '{"ok":true}' } }],
    });
    expect(out).toEqual({ ok: true });
  });

  it("parseOpenAiJson strips markdown code fences", () => {
    const out = parseOpenAiJson<{ value: number }>({
      choices: [{ message: { content: "```json\n{\"value\":42}\n```" } }],
    });
    expect(out.value).toBe(42);
  });

  it("parseOpenAiJson throws when content is missing", () => {
    expect(() => parseOpenAiJson({ choices: [{ message: {} }] })).toThrow(
      "OpenAI response missing message content.",
    );
  });

  it("callOpenAiJson sends plain prompt payload without reasoning effort when unsupported", async () => {
    await callOpenAiJson("gpt-4o-mini", "Hello", { reasoningEffort: "high" });

    expect(createMock).toHaveBeenCalledWith(
      expect.objectContaining({
        model: "gpt-4o-mini",
        response_format: { type: "json_object" },
        messages: [{ role: "user", content: "Hello" }],
      }),
    );
    expect((createMock.mock.calls[0]?.[0] as Record<string, unknown>).reasoning_effort).toBeUndefined();
  });

  it("callOpenAiJson includes reasoning_effort for supported models", async () => {
    await callOpenAiJson("gpt-5.2", "Hello", { reasoningEffort: "high" });

    expect(createMock).toHaveBeenCalledWith(
      expect.objectContaining({
        model: "gpt-5.2",
        reasoning_effort: "high",
      }),
    );
  });

  it("callOpenAiJson sends image content as text + image_url blocks", async () => {
    await callOpenAiJson("gpt-4o-mini", "Read this", { image: "data:image/png;base64,abc" });

    expect(createMock).toHaveBeenCalledWith(
      expect.objectContaining({
        messages: [
          {
            role: "user",
            content: [
              { type: "text", text: "Read this" },
              { type: "image_url", image_url: { url: "data:image/png;base64,abc" } },
            ],
          },
        ],
      }),
    );
  });
});


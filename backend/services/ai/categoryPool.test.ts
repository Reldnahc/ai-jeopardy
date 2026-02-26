import { beforeEach, describe, expect, it, vi } from "vitest";

const { envMock, callOpenAiJsonMock, parseOpenAiJsonMock } = vi.hoisted(() => ({
  envMock: { OPENAI_CATEGORY_POOL_MODEL: "gpt-default" },
  callOpenAiJsonMock: vi.fn(),
  parseOpenAiJsonMock: vi.fn(),
}));

vi.mock("../../config/env.js", () => ({
  env: envMock,
}));

vi.mock("./openaiClient.js", () => ({
  callOpenAiJson: callOpenAiJsonMock,
  parseOpenAiJson: parseOpenAiJsonMock,
}));

import { generateCategoryPoolFromOpenAi } from "./categoryPool.js";

describe("ai/categoryPool", () => {
  beforeEach(() => {
    callOpenAiJsonMock.mockReset();
    parseOpenAiJsonMock.mockReset();
    callOpenAiJsonMock.mockResolvedValue({ raw: true });
  });

  it("clamps count and uses default model and trimmed prompt", async () => {
    parseOpenAiJsonMock.mockReturnValue({
      categories: ["  Space Probes ", "Space Probes", "", "Moons & Rings"],
    });

    const out = await generateCategoryPoolFromOpenAi({ count: 5, prompt: "  space  " });

    expect(callOpenAiJsonMock).toHaveBeenCalledWith(
      "gpt-default",
      expect.stringContaining("exactly 20 unique category names."),
    );
    expect(callOpenAiJsonMock.mock.calls[0]?.[1] as string).toContain("User prompt: space");
    expect(out).toEqual(["Space Probes", "Moons & Rings"]);
  });

  it("respects model override and upper count clamp", async () => {
    parseOpenAiJsonMock.mockReturnValue({
      categories: Array.from({ length: 260 }, (_, i) => `Category ${i}`),
    });

    const out = await generateCategoryPoolFromOpenAi({ count: 999, model: "gpt-custom" });

    expect(callOpenAiJsonMock).toHaveBeenCalledWith(
      "gpt-custom",
      expect.stringContaining("exactly 200 unique category names."),
    );
    expect(out).toHaveLength(200);
    expect(out[0]).toBe("Category 0");
  });

  it("throws when no usable categories are returned", async () => {
    parseOpenAiJsonMock.mockReturnValue({ categories: [null, " ", ""] });

    await expect(generateCategoryPoolFromOpenAi({ count: 50 })).rejects.toThrow(
      "OpenAI returned no categories.",
    );
  });
});

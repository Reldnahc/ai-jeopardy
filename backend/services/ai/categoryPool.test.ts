import { beforeEach, describe, expect, it, vi } from "vitest";

const { envMock, callAiJsonMock, parseAiJsonMock } = vi.hoisted(() => ({
  envMock: { CATEGORY_POOL_MODEL: "gpt-default" },
  callAiJsonMock: vi.fn(),
  parseAiJsonMock: vi.fn(),
}));

vi.mock("../../config/env.js", () => ({
  env: envMock,
}));

vi.mock("./aiClients/index.js", () => ({
  callAiJson: callAiJsonMock,
  parseAiJson: parseAiJsonMock,
}));

import { generateCategoryPoolFromAi } from "./categoryPool.js";

describe("ai/categoryPool", () => {
  beforeEach(() => {
    callAiJsonMock.mockReset();
    parseAiJsonMock.mockReset();
    callAiJsonMock.mockResolvedValue({ raw: true });
  });

  it("clamps count and uses default model and trimmed prompt", async () => {
    parseAiJsonMock.mockReturnValue({
      categories: ["  Space Probes ", "Space Probes", "", "Moons & Rings"],
    });

    const out = await generateCategoryPoolFromAi({ count: 5, prompt: "  space  " });

    expect(callAiJsonMock).toHaveBeenCalledWith(
      "gpt-default",
      expect.stringContaining("exactly 20 unique category names."),
    );
    expect(callAiJsonMock.mock.calls[0]?.[1] as string).toContain("User prompt: space");
    expect(out).toEqual(["Space Probes", "Moons & Rings"]);
  });

  it("respects model override and upper count clamp", async () => {
    parseAiJsonMock.mockReturnValue({
      categories: Array.from({ length: 260 }, (_, i) => `Category ${i}`),
    });

    const out = await generateCategoryPoolFromAi({ count: 999, model: "gpt-custom" });

    expect(callAiJsonMock).toHaveBeenCalledWith(
      "gpt-custom",
      expect.stringContaining("exactly 200 unique category names."),
    );
    expect(out).toHaveLength(200);
    expect(out[0]).toBe("Category 0");
  });

  it("throws when no usable categories are returned", async () => {
    parseAiJsonMock.mockReturnValue({ categories: [null, " ", ""] });

    await expect(generateCategoryPoolFromAi({ count: 50 })).rejects.toThrow(
      "AI model returned no categories.",
    );
  });
});

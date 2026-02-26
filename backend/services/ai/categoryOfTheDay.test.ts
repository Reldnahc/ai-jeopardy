import { beforeEach, describe, expect, it, vi } from "vitest";

const { callOpenAiJsonMock, parseOpenAiJsonMock, appConfigMock } = vi.hoisted(() => ({
  callOpenAiJsonMock: vi.fn(),
  parseOpenAiJsonMock: vi.fn(),
  appConfigMock: { ai: { cotdModel: "cotd-model" } },
}));

vi.mock("./openaiClient.js", () => ({
  callOpenAiJson: callOpenAiJsonMock,
  parseOpenAiJson: parseOpenAiJsonMock,
}));

vi.mock("../../config/appConfig.js", () => ({
  appConfig: appConfigMock,
}));

describe("ai/categoryOfTheDay", () => {
  beforeEach(() => {
    vi.resetModules();
    callOpenAiJsonMock.mockReset();
    parseOpenAiJsonMock.mockReset();
    callOpenAiJsonMock.mockResolvedValue({ raw: true });
  });

  it("returns first generated category when not similar", async () => {
    parseOpenAiJsonMock.mockReturnValue({
      category: "Space Oddities",
      description: "A playful journey through unusual moments in space exploration.",
    });

    const { __resetCategoryOfTheDayStateForTests, createCategoryOfTheDay } = await import(
      "./categoryOfTheDay.js"
    );
    __resetCategoryOfTheDayStateForTests();
    const out = await createCategoryOfTheDay();

    expect(out.category).toBe("Space Oddities");
    expect(callOpenAiJsonMock).toHaveBeenCalledTimes(1);
    expect(callOpenAiJsonMock).toHaveBeenCalledWith(
      "cotd-model",
      expect.stringContaining("Category of the Day"),
      {},
    );
  });

  it("retries once when first result is too similar to recent category", async () => {
    parseOpenAiJsonMock
      .mockReturnValueOnce({
        category: "Whimsical Wonders",
        description: "A fun category about odd and delightful facts.",
      })
      .mockReturnValueOnce({
        category: "Whimsical Wonder",
        description: "This is too similar and should trigger retry.",
      })
      .mockReturnValueOnce({
        category: "Hidden Histories",
        description: "Untold stories and little-known events from around the world.",
      });

    const { __resetCategoryOfTheDayStateForTests, createCategoryOfTheDay } = await import(
      "./categoryOfTheDay.js"
    );
    __resetCategoryOfTheDayStateForTests();

    await createCategoryOfTheDay();
    const out = await createCategoryOfTheDay();

    expect(out.category).toBe("Hidden Histories");
    expect(callOpenAiJsonMock).toHaveBeenCalledTimes(3);
    expect(callOpenAiJsonMock.mock.calls[2]?.[1] as string).toContain("too similar to recent ones");
  });

  it("helper utilities cover shape, similarity, and prompt rendering", async () => {
    const {
      __resetCategoryOfTheDayStateForTests,
      buildCategoryOfTheDayPrompt,
      categoryShape,
      isTooSimilarToRecent,
      normalizeCategoryName,
      pushRecentCategory,
      pushRecentShape,
    } = await import("./categoryOfTheDay.js");
    __resetCategoryOfTheDayStateForTests();

    expect(normalizeCategoryName("  Space  ")).toBe("space");
    expect(categoryShape("One")).toBe("1w");
    expect(categoryShape("Two Words")).toBe("2w");
    expect(categoryShape("Three Word Name")).toBe("3w");
    expect(categoryShape("A Four Word Name")).toBe("4w+");

    pushRecentCategory("Whimsical Wonders");
    pushRecentShape("2w");
    expect(isTooSimilarToRecent("whimsical wonders")).toBe(true);
    expect(isTooSimilarToRecent("Whimsical Wonder")).toBe(true);
    expect(isTooSimilarToRecent("Hidden Histories")).toBe(false);

    const prompt = buildCategoryOfTheDayPrompt();
    expect(prompt).toContain("Recent categories to avoid:");
    expect(prompt).toContain("- whimsical wonders");
    expect(prompt).toContain("Recently-used category lengths");
    expect(prompt).toContain("2w");
  });
});

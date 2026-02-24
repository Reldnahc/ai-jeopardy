import { beforeEach, describe, expect, it, vi } from "vitest";

const { callOpenAiJson, parseOpenAiJson } = vi.hoisted(() => ({
  callOpenAiJson: vi.fn(async () => ({ choices: [{ message: { content: "{\"verdict\":\"incorrect\"}" } }] })),
  parseOpenAiJson: vi.fn(() => ({ verdict: "incorrect" })),
}));

vi.mock("../openaiClient.js", () => ({
  callOpenAiJson,
  parseOpenAiJson,
}));

import { judgeClueAnswerFast } from "./judgeText.js";

describe("judgeClueAnswerFast", () => {
  beforeEach(() => {
    callOpenAiJson.mockClear();
    parseOpenAiJson.mockClear();
  });

  it("accepts conversational phrasing via deterministic fast path", async () => {
    const out = await judgeClueAnswerFast(
      "what is an exoplanet",
      "there's an exoplanet",
      "This world orbits another star.",
    );

    expect(out.verdict).toBe("correct");
    expect(callOpenAiJson).not.toHaveBeenCalled();
  });

  it("accepts conservative minor spelling difference on one long token", async () => {
    const out = await judgeClueAnswerFast(
      "what is an exoplaet",
      "there's an exoplanet",
      "A planet beyond our solar system.",
    );

    expect(out.verdict).toBe("correct");
    expect(callOpenAiJson).not.toHaveBeenCalled();
  });

  it("does not fast-accept short-token mismatches", async () => {
    parseOpenAiJson.mockReturnValueOnce({ verdict: "incorrect" });

    const out = await judgeClueAnswerFast("what is a cat", "there's a car", "House pet.");

    expect(out.verdict).toBe("incorrect");
    expect(callOpenAiJson).toHaveBeenCalledTimes(1);
  });
});


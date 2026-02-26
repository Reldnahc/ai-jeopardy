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
      "Space",
    );

    expect(out.verdict).toBe("correct");
    expect(callOpenAiJson).not.toHaveBeenCalled();
  });

  it("accepts conservative minor spelling difference on one long token", async () => {
    const out = await judgeClueAnswerFast(
      "what is an exoplaet",
      "there's an exoplanet",
      "A planet beyond our solar system.",
      "Space",
    );

    expect(out.verdict).toBe("correct");
    expect(callOpenAiJson).not.toHaveBeenCalled();
  });

  it("does not fast-accept short-token mismatches", async () => {
    parseOpenAiJson.mockReturnValueOnce({ verdict: "incorrect" });

    const out = await judgeClueAnswerFast("what is a cat", "there's a car", "House pet.", "Animals");

    expect(out.verdict).toBe("incorrect");
    expect(callOpenAiJson).toHaveBeenCalledTimes(1);
  });

  it("rejects overly generic transcript when expected is specific", async () => {
    const out = await judgeClueAnswerFast("what is saturn", "it", "Gas giant with rings.", "Space");

    expect(out.verdict).toBe("incorrect");
    expect(callOpenAiJson).not.toHaveBeenCalled();
  });

  it("accepts valid model verdict when parser returns correct", async () => {
    parseOpenAiJson.mockReturnValueOnce({ verdict: "correct" });

    const out = await judgeClueAnswerFast("what is a cat", "a feline", "House pet.", "Animals");

    expect(out.verdict).toBe("correct");
    expect(callOpenAiJson).toHaveBeenCalledTimes(1);
  });

  it("falls back to incorrect on parse failure or unknown verdict", async () => {
    parseOpenAiJson.mockImplementationOnce(() => {
      throw new Error("bad json");
    });

    const parseFail = await judgeClueAnswerFast("what is a cat", "a car", "House pet.", "Animals");
    expect(parseFail.verdict).toBe("incorrect");

    parseOpenAiJson.mockReturnValueOnce({ verdict: "maybe" });
    const badVerdict = await judgeClueAnswerFast("what is a cat", "a car", "House pet.", "Animals");
    expect(badVerdict.verdict).toBe("incorrect");
  });
});

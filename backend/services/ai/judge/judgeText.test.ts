import { beforeEach, describe, expect, it, vi } from "vitest";

const { callAiJson, parseAiJson, resolveProviderForModel } = vi.hoisted(() => ({
  callAiJson: vi.fn(async () => ({
    choices: [{ message: { content: '{"verdict":"incorrect"}' } }],
  })),
  parseAiJson: vi.fn(() => ({ verdict: "incorrect" })),
  resolveProviderForModel: vi.fn(() => "deepseek"),
}));

vi.mock("../aiClients/index.js", () => ({
  callAiJson,
  parseAiJson,
  resolveProviderForModel,
}));

import { judgeClueAnswerFast, judgeClueAnswerWithModel } from "./judgeText.js";

describe("judgeClueAnswerFast", () => {
  beforeEach(() => {
    callAiJson.mockClear();
    parseAiJson.mockClear();
    resolveProviderForModel.mockClear();
  });

  it("accepts conversational phrasing via deterministic fast path", async () => {
    const out = await judgeClueAnswerFast(
      "what is an exoplanet",
      "there's an exoplanet",
      "This world orbits another star.",
      "Space",
    );

    expect(out.verdict).toBe("correct");
    expect(callAiJson).not.toHaveBeenCalled();
  });

  it("accepts conservative minor spelling difference on one long token", async () => {
    const out = await judgeClueAnswerFast(
      "what is an exoplaet",
      "there's an exoplanet",
      "A planet beyond our solar system.",
      "Space",
    );

    expect(out.verdict).toBe("correct");
    expect(callAiJson).not.toHaveBeenCalled();
  });

  it("accepts adjacent transposition on a long token via deterministic fast path", async () => {
    const out = await judgeClueAnswerFast(
      "what is new yrok city",
      "it's new york city",
      "The most populous city in the United States.",
      "Geography",
    );

    expect(out.verdict).toBe("correct");
    expect(callAiJson).not.toHaveBeenCalled();
  });

  it("accepts common initialisms via deterministic fast path", async () => {
    const out = await judgeClueAnswerFast(
      "what is the federal bureau of investigation",
      "f b i",
      "This U.S. domestic intelligence and security service is part of the DOJ.",
      "Government",
    );

    expect(out.verdict).toBe("correct");
    expect(callAiJson).not.toHaveBeenCalled();
  });

  it("accepts corrected final answers via deterministic fast path", async () => {
    const out = await judgeClueAnswerFast(
      "what is gold",
      "silver, no gold",
      "This element has the atomic number 79.",
      "Science",
    );

    expect(out.verdict).toBe("correct");
    expect(callAiJson).not.toHaveBeenCalled();
  });

  it("rejects explicit corrections away from the right answer without using the model", async () => {
    const out = await judgeClueAnswerFast(
      "who is michelangelo",
      "Michelangelo - actually no, Leonardo da Vinci",
      "He painted the Sistine Chapel ceiling.",
      "Art",
    );

    expect(out.verdict).toBe("incorrect");
    expect(callAiJson).not.toHaveBeenCalled();
  });

  it("accepts aliases explicitly named in the clue via deterministic fast path", async () => {
    const out = await judgeClueAnswerFast(
      "what is istanbul",
      "what is constantinople",
      "This city, formerly called Byzantium and Constantinople, is Turkey's most populous city.",
      "Geography",
    );

    expect(out.verdict).toBe("correct");
    expect(callAiJson).not.toHaveBeenCalled();
  });

  it("accepts dropped generic geography words via deterministic fast path", async () => {
    const out = await judgeClueAnswerFast(
      "what is the sahara desert",
      "what is the sahara",
      "This is the largest hot desert in the world.",
      "Geography",
    );

    expect(out.verdict).toBe("correct");
    expect(callAiJson).not.toHaveBeenCalled();
  });

  it("accepts more specific variants when the head noun matches exactly", async () => {
    const out = await judgeClueAnswerFast(
      "what is elephant",
      "what is an african elephant",
      "This large tusked animal is the largest land animal on Earth.",
      "Animals",
    );

    expect(out.verdict).toBe("correct");
    expect(callAiJson).not.toHaveBeenCalled();
  });

  it("does not fast-accept short-token mismatches", async () => {
    parseAiJson.mockReturnValueOnce({ verdict: "incorrect" });

    const out = await judgeClueAnswerFast(
      "what is a cat",
      "there's a car",
      "House pet.",
      "Animals",
    );

    expect(out.verdict).toBe("incorrect");
    expect(callAiJson).toHaveBeenCalledTimes(1);
  });

  it("rejects overly generic transcript when expected is specific", async () => {
    const out = await judgeClueAnswerFast("what is saturn", "it", "Gas giant with rings.", "Space");

    expect(out.verdict).toBe("incorrect");
    expect(callAiJson).not.toHaveBeenCalled();
  });

  it("accepts valid model verdict when parser returns correct", async () => {
    parseAiJson.mockReturnValueOnce({ verdict: "correct" });

    const out = await judgeClueAnswerFast("what is a cat", "a feline", "House pet.", "Animals");

    expect(out.verdict).toBe("correct");
    expect(callAiJson).toHaveBeenCalledTimes(1);
  });

  it("uses the explicitly provided model in the shared judge helper", async () => {
    parseAiJson.mockReturnValueOnce({ verdict: "correct" });

    const out = await judgeClueAnswerWithModel({
      expectedAnswer: "what is a cat",
      transcript: "a feline",
      question: "House pet.",
      category: "Animals",
      model: "deepseek-chat",
    });

    expect(out.verdict).toBe("correct");
    expect(callAiJson).toHaveBeenCalledWith("deepseek-chat", expect.any(String), {
      reasoningEffort: "off",
    });
  });

  it("falls back to incorrect on parse failure or unknown verdict", async () => {
    parseAiJson.mockImplementationOnce(() => {
      throw new Error("bad json");
    });

    const parseFail = await judgeClueAnswerFast("what is a cat", "a car", "House pet.", "Animals");
    expect(parseFail.verdict).toBe("incorrect");

    parseAiJson.mockReturnValueOnce({ verdict: "maybe" });
    const badVerdict = await judgeClueAnswerFast("what is a cat", "a car", "House pet.", "Animals");
    expect(badVerdict.verdict).toBe("incorrect");
  });
});

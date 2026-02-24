import { beforeEach, describe, expect, it, vi } from "vitest";

const { callOpenAiJsonMock, parseOpenAiJsonMock } = vi.hoisted(() => ({
  callOpenAiJsonMock: vi.fn(),
  parseOpenAiJsonMock: vi.fn(),
}));

vi.mock("../openaiClient.js", () => ({
  callOpenAiJson: callOpenAiJsonMock,
  parseOpenAiJson: parseOpenAiJsonMock,
}));

import { parseFinalWagerImage } from "./wagerImage.js";

describe("parseFinalWagerImage", () => {
  beforeEach(() => {
    callOpenAiJsonMock.mockReset();
    parseOpenAiJsonMock.mockReset();
  });

  it("returns zero-max fallback when max wager is not positive or image missing", async () => {
    await expect(parseFinalWagerImage("", 1000)).resolves.toEqual({
      wager: 0,
      transcript: "",
      confidence: 1,
      reason: "zero-max",
    });
    await expect(parseFinalWagerImage("img", 0)).resolves.toEqual({
      wager: 0,
      transcript: "",
      confidence: 1,
      reason: "zero-max",
    });
    expect(callOpenAiJsonMock).not.toHaveBeenCalled();
  });

  it("uses model wager when parse returns numeric-like wager", async () => {
    callOpenAiJsonMock.mockResolvedValueOnce({ any: true });
    parseOpenAiJsonMock.mockReturnValueOnce({
      transcript: "$1,200",
      wager: "$1,200",
      confidence: 1.3,
      reason: null,
    });

    const out = await parseFinalWagerImage("img", 5000);
    expect(out).toEqual({
      wager: 1200,
      transcript: "$1,200",
      confidence: 1,
      reason: "ok",
    });
  });

  it("falls back to transcript number extraction when model wager is null", async () => {
    callOpenAiJsonMock.mockResolvedValueOnce({ any: true });
    parseOpenAiJsonMock.mockReturnValueOnce({
      transcript: "I wager - 700",
      wager: null,
      confidence: 0.2,
      reason: null,
    });

    const out = await parseFinalWagerImage("img", 2000);
    expect(out).toEqual({
      wager: 700,
      transcript: "I wager - 700",
      confidence: 0.5,
      reason: "fallback",
    });
  });

  it("returns unreadable when no numeric wager can be parsed", async () => {
    callOpenAiJsonMock.mockResolvedValueOnce({ any: true });
    parseOpenAiJsonMock.mockReturnValueOnce({
      transcript: "all in maybe?",
      wager: null,
      confidence: 0.7,
      reason: null,
    });

    const out = await parseFinalWagerImage("img", 2000);
    expect(out).toEqual({
      wager: null,
      transcript: "all in maybe?",
      confidence: 0.7,
      reason: "unreadable",
    });
  });

  it("returns model-error when model call fails", async () => {
    callOpenAiJsonMock.mockRejectedValueOnce(new Error("boom"));

    const out = await parseFinalWagerImage("img", 2000);
    expect(out).toEqual({
      wager: null,
      transcript: "",
      confidence: 0,
      reason: "model-error",
    });
  });
});

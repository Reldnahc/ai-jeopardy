import { describe, expect, it } from "vitest";
import { buildExpectedAnswerPrompt, looksComprehensible } from "./prompt.js";

describe("stt prompt helpers", () => {
  it("buildExpectedAnswerPrompt returns undefined for empty context", () => {
    expect(buildExpectedAnswerPrompt("")).toBeUndefined();
    expect(buildExpectedAnswerPrompt("   ")).toBeUndefined();
    expect(buildExpectedAnswerPrompt([])).toBeUndefined();
    expect(buildExpectedAnswerPrompt([undefined])).toBeUndefined();
  });

  it("buildExpectedAnswerPrompt uses first entry for array context", () => {
    const out = buildExpectedAnswerPrompt(["  Mount Rushmore  ", "Ignored"]);
    expect(out).toContain("Expected answer hint (may or may not be spoken):");
    expect(out).toContain("Mount Rushmore");
    expect(out).toContain("Return only the transcript.");
  });

  it("looksComprehensible rejects blank, too-short, and symbol-only inputs", () => {
    expect(looksComprehensible("")).toBe(false);
    expect(looksComprehensible("a")).toBe(false);
    expect(looksComprehensible("   ")).toBe(false);
    expect(looksComprehensible("?!@#$")).toBe(false);
  });

  it("looksComprehensible accepts reasonably meaningful text", () => {
    expect(looksComprehensible("ok")).toBe(true);
    expect(looksComprehensible("A1")).toBe(true);
    expect(looksComprehensible("hello world")).toBe(true);
  });
});

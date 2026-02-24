import { describe, expect, it } from "vitest";
import { clampLen, hasAnyAlphaNum, normalizeJeopardyText } from "./normalize.js";

describe("judge normalize", () => {
  it("strips jeopardy-style question prefixes", () => {
    expect(normalizeJeopardyText("What is an Exoplanet?")).toBe("an exoplanet");
    expect(normalizeJeopardyText("Who are The Beatles")).toBe("the beatles");
  });

  it("strips conversational answer prefixes", () => {
    expect(normalizeJeopardyText("there's an exoplanet")).toBe("an exoplanet");
    expect(normalizeJeopardyText("the answer is Saturn")).toBe("saturn");
    expect(normalizeJeopardyText("I think it's Jupiter")).toBe("jupiter");
  });

  it("normalizes punctuation and whitespace", () => {
    expect(normalizeJeopardyText("  It's...   New-York!!  ")).toBe("new york");
  });

  it("hasAnyAlphaNum detects meaningful text", () => {
    expect(hasAnyAlphaNum("   ...")).toBe(false);
    expect(hasAnyAlphaNum("123")).toBe(true);
    expect(hasAnyAlphaNum("abc")).toBe(true);
  });

  it("clampLen truncates with ellipsis when over max", () => {
    expect(clampLen("hello", 10)).toBe("hello");
    expect(clampLen("abcdef", 4)).toBe("abcd…");
  });
});

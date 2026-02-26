import { describe, expect, it } from "vitest";
import { containsProfanity } from "./profanityService.js";

describe("profanityService", () => {
  it("returns false for empty or clean text", () => {
    expect(containsProfanity("")).toBe(false);
    expect(containsProfanity("   ")).toBe(false);
    expect(containsProfanity("hello team")).toBe(false);
  });

  it("detects direct profanity", () => {
    expect(containsProfanity("this is shit")).toBe(true);
    expect(containsProfanity("fucking unbelievable")).toBe(true);
  });

  it("detects obfuscated profanity with separators and digits", () => {
    expect(containsProfanity("f.u.c.k")).toBe(true);
    expect(containsProfanity("s h i t")).toBe(true);
    expect(containsProfanity("fuck123")).toBe(true);
  });
});

import { describe, expect, it } from "vitest";
import { normalizeEmail, normalizeUsername } from "./profile.util.js";

describe("profile.util", () => {
  it("normalizeUsername trims and lowercases", () => {
    expect(normalizeUsername(" Alice ")).toBe("alice");
    expect(normalizeUsername(null)).toBe("");
  });

  it("normalizeEmail returns null for empty", () => {
    expect(normalizeEmail(" USER@EXAMPLE.COM ")).toBe("user@example.com");
    expect(normalizeEmail("   ")).toBeNull();
    expect(normalizeEmail(null)).toBeNull();
  });
});

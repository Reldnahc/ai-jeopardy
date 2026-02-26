import { describe, expect, it, vi } from "vitest";
import { normalizeCategory, shuffle } from "./categoryUtils.js";

describe("categoryUtils", () => {
  it("normalizeCategory lowercases, strips punctuation, and normalizes spaces", () => {
    expect(normalizeCategory("  Pop-Culture : Icons  ")).toBe("popculture icons");
    expect(normalizeCategory("SCIENCE: SPACE")).toBe("science space");
  });

  it("shuffle returns all original items without mutating source", () => {
    const src = ["a", "b", "c", "d"];
    const randomSpy = vi.spyOn(Math, "random").mockReturnValue(0);

    const out = shuffle(src);

    expect(src).toEqual(["a", "b", "c", "d"]);
    expect(out).toHaveLength(src.length);
    expect([...out].sort()).toEqual([...src].sort());
    expect(out).toEqual(["b", "c", "d", "a"]);

    randomSpy.mockRestore();
  });
});

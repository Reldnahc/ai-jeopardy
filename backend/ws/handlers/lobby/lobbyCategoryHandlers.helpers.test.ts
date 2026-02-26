import { describe, expect, it } from "vitest";
import {
  isBoardIndexInRange,
  isBoardType,
  isLockedCategory,
  parseBoardIndex,
  toGlobalCategoryIndex,
} from "./lobbyCategoryHandlers.js";

describe("lobbyCategoryHandlers helpers", () => {
  it("validates board types", () => {
    expect(isBoardType("firstBoard")).toBe(true);
    expect(isBoardType("secondBoard")).toBe(true);
    expect(isBoardType("finalJeopardy")).toBe(true);
    expect(isBoardType("bogus")).toBe(false);
  });

  it("parses board index and validates ranges", () => {
    expect(parseBoardIndex("2")).toBe(2);
    expect(parseBoardIndex("nan")).toBeNull();

    expect(isBoardIndexInRange("firstBoard", 0)).toBe(true);
    expect(isBoardIndexInRange("firstBoard", 5)).toBe(false);
    expect(isBoardIndexInRange("secondBoard", 4)).toBe(true);
    expect(isBoardIndexInRange("finalJeopardy", 0)).toBe(true);
    expect(isBoardIndexInRange("finalJeopardy", 1)).toBe(false);
  });

  it("maps board/index to global category index", () => {
    expect(toGlobalCategoryIndex("firstBoard", 2)).toBe(2);
    expect(toGlobalCategoryIndex("secondBoard", 2)).toBe(7);
    expect(toGlobalCategoryIndex("finalJeopardy", 0)).toBe(10);
  });

  it("checks locked category state safely", () => {
    const locked = {
      firstBoard: [false, true, false, false, false],
      secondBoard: [false, false, false, true, false],
      finalJeopardy: [true],
    };

    expect(isLockedCategory(locked, "firstBoard", 1)).toBe(true);
    expect(isLockedCategory(locked, "secondBoard", 3)).toBe(true);
    expect(isLockedCategory(locked, "finalJeopardy", 0)).toBe(true);
    expect(isLockedCategory(locked, "firstBoard", 0)).toBe(false);
    expect(isLockedCategory(undefined, "firstBoard", 0)).toBe(false);
  });
});

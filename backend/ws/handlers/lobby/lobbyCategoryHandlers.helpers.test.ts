import { describe, expect, it } from "vitest";
import {
  isLobbyBoardIndexInRange,
  isLobbyBoardType,
  isLockedLobbyCategory,
  parseLobbyBoardIndex,
  toGlobalLobbyCategoryIndex,
} from "../../../lobby/categorySlots.js";

describe("lobbyCategoryHandlers helpers", () => {
  it("validates board types", () => {
    expect(isLobbyBoardType("firstBoard")).toBe(true);
    expect(isLobbyBoardType("secondBoard")).toBe(true);
    expect(isLobbyBoardType("finalJeopardy")).toBe(true);
    expect(isLobbyBoardType("bogus")).toBe(false);
  });

  it("parses board index and validates ranges", () => {
    expect(parseLobbyBoardIndex("2")).toBe(2);
    expect(parseLobbyBoardIndex("nan")).toBeNull();

    expect(isLobbyBoardIndexInRange("firstBoard", 0)).toBe(true);
    expect(isLobbyBoardIndexInRange("firstBoard", 5)).toBe(false);
    expect(isLobbyBoardIndexInRange("secondBoard", 4)).toBe(true);
    expect(isLobbyBoardIndexInRange("finalJeopardy", 0)).toBe(true);
    expect(isLobbyBoardIndexInRange("finalJeopardy", 1)).toBe(false);
  });

  it("maps board/index to global category index", () => {
    expect(toGlobalLobbyCategoryIndex("firstBoard", 2)).toBe(2);
    expect(toGlobalLobbyCategoryIndex("secondBoard", 2)).toBe(7);
    expect(toGlobalLobbyCategoryIndex("finalJeopardy", 0)).toBe(10);
  });

  it("checks locked category state safely", () => {
    const locked = {
      firstBoard: [false, true, false, false, false],
      secondBoard: [false, false, false, true, false],
      finalJeopardy: [true],
    };

    expect(isLockedLobbyCategory(locked, "firstBoard", 1)).toBe(true);
    expect(isLockedLobbyCategory(locked, "secondBoard", 3)).toBe(true);
    expect(isLockedLobbyCategory(locked, "finalJeopardy", 0)).toBe(true);
    expect(isLockedLobbyCategory(locked, "firstBoard", 0)).toBe(false);
    expect(isLockedLobbyCategory(undefined, "firstBoard", 0)).toBe(false);
  });
});

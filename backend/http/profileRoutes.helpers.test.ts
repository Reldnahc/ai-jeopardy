import { describe, expect, it } from "vitest";
import {
  asRecord,
  asTrimmedString,
  clampFiniteNumber,
  normalizeUsername,
  parseBatchUsernames,
  parseBoardsLimit,
  parseBoardsOffset,
  parseSearchLimit,
} from "./profileRoutes.js";

describe("profileRoutes helpers", () => {
  it("normalizes usernames and trims strings", () => {
    expect(normalizeUsername("  Alice ")).toBe("alice");
    expect(asTrimmedString("  x  ")).toBe("x");
    expect(asTrimmedString(null)).toBe("");
  });

  it("converts unknown values to records safely", () => {
    expect(asRecord({ a: 1 })).toEqual({ a: 1 });
    expect(asRecord(null)).toEqual({});
    expect(asRecord("nope")).toEqual({});
  });

  it("clamps numeric values with fallback when not finite", () => {
    expect(clampFiniteNumber("10", 5, 1, 20)).toBe(10);
    expect(clampFiniteNumber("999", 5, 1, 20)).toBe(20);
    expect(clampFiniteNumber("-3", 5, 1, 20)).toBe(1);
    expect(clampFiniteNumber("nan", 5, 1, 20)).toBe(5);
  });

  it("parses route-specific limits and offsets", () => {
    expect(parseSearchLimit(undefined)).toBe(5);
    expect(parseSearchLimit(999)).toBe(20);
    expect(parseBoardsLimit(undefined)).toBe(10);
    expect(parseBoardsLimit(999)).toBe(50);
    expect(parseBoardsOffset(-10)).toBe(0);
    expect(parseBoardsOffset(12)).toBe(12);
  });

  it("parses batch usernames from arrays and csv strings", () => {
    expect(parseBatchUsernames([" Alice ", "", "Bob"])).toEqual(["alice", "bob"]);
    expect(parseBatchUsernames("Alice,bob")).toEqual(["alice", "bob"]);
    expect(parseBatchUsernames(undefined)).toEqual([]);
  });
});

import { afterEach, describe, expect, it, vi } from "vitest";
import { computeDailyDoubleMaxWager } from "./helpers.js";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("dailyDouble helpers", () => {
  it("returns board max when it exceeds player score", () => {
    const game = {
      boardData: {
        firstBoard: {
          categories: [{ values: [{ value: "$200" }, { value: "$1000" }, { value: "$100" }] }],
        },
      },
      scores: { alice: 500 },
    };

    expect(computeDailyDoubleMaxWager(game as never, "firstBoard", "alice")).toBe(1000);
  });

  it("returns player score when it exceeds board max", () => {
    const game = {
      boardData: {
        firstBoard: {
          categories: [{ values: [{ value: "$200" }, { value: "$400" }] }],
        },
      },
      scores: { alice: 1200 },
    };

    expect(computeDailyDoubleMaxWager(game as never, "firstBoard", "alice")).toBe(1200);
  });

  it("handles missing board/scores and negative score safely", () => {
    const game = {
      boardData: { firstBoard: { categories: [{}, { values: [{ value: undefined }] }] } },
      scores: { alice: -200 },
    };

    expect(computeDailyDoubleMaxWager(game as never, "firstBoard", "alice")).toBe(0);
    expect(computeDailyDoubleMaxWager({} as never, "missing", "nobody")).toBe(0);
  });

  it("falls back to 0 when numeric parsing is non-finite", () => {
    vi.spyOn(Number, "isFinite").mockReturnValue(false);
    const game = {
      boardData: {
        firstBoard: {
          categories: [{ values: [{ value: "$1000" }] }],
        },
      },
      scores: { alice: 0 },
    };

    expect(computeDailyDoubleMaxWager(game as never, "firstBoard", "alice")).toBe(0);
  });
});

import { beforeEach, describe, expect, it, vi } from "vitest";
import { getUniqueCategories } from "../services/categories/getUniqueCategories.js";
import { buildRefreshedLobbyCategories } from "./categoryPoolRefresh.js";

vi.mock("../services/categories/getUniqueCategories.js", () => ({
  getUniqueCategories: vi.fn(),
}));

describe("category pool refresh helpers", () => {
  beforeEach(() => {
    vi.mocked(getUniqueCategories).mockReset();
  });

  it("preserves locked categories while replacing unlocked ones from the pool", () => {
    const next = buildRefreshedLobbyCategories({
      currentCategories: ["A", "B", "C", "D", "E", "F", "G", "H", "I", "J", "K"],
      lockedCategories: {
        firstBoard: [false, true, false, false, false],
        secondBoard: [false, false, false, true, false],
        finalJeopardy: [true],
      },
      pool: ["P1", "P2", "P3", "P4", "P5", "P6", "P7", "P8", "P9", "P10", "P11", "P12"],
    });

    expect(next[1]).toBe("B");
    expect(next[8]).toBe("I");
    expect(next[10]).toBe("K");
    expect(next[0]).toMatch(/^P/);
    expect(next[2]).toMatch(/^P/);
    expect(next[9]).toMatch(/^P/);
    expect(vi.mocked(getUniqueCategories)).not.toHaveBeenCalled();
  });

  it("falls back to generated categories when the pool is too small", () => {
    vi.mocked(getUniqueCategories).mockReturnValue([
      "G2",
      "G3",
      "G4",
      "G5",
      "G6",
      "G7",
      "G8",
      "G9",
      "G10",
      "G11",
    ]);

    const next = buildRefreshedLobbyCategories({
      currentCategories: ["A", "B", "C", "D", "E", "F", "G", "H", "I", "J", "K"],
      lockedCategories: undefined,
      pool: ["P1"],
    });

    expect(next).toContain("P1");
    expect(next).toContain("G11");
    expect(vi.mocked(getUniqueCategories)).toHaveBeenCalledWith(10, {
      exclude: ["P1"],
    });
  });
});

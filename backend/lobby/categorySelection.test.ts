import { describe, expect, it, vi } from "vitest";
import { applyLobbyCategoryValue, chooseRandomLobbyCategory } from "./categorySelection.js";

describe("categorySelection helpers", () => {
  it("prefers unique category-pool entries before fallback generation", () => {
    const getUniqueCategoriesFn = vi.fn(() => ["Generator Choice"]);

    const chosen = chooseRandomLobbyCategory({
      currentCategories: ["A", "B", "C"],
      categoryPool: ["A", "Pool Choice", "B"],
      getUniqueCategoriesFn,
    });

    expect(chosen).toBe("Pool Choice");
    expect(getUniqueCategoriesFn).not.toHaveBeenCalled();
  });

  it("falls back to generated unique categories when the pool is exhausted", () => {
    const getUniqueCategoriesFn = vi.fn(() => ["Generated Choice"]);

    const chosen = chooseRandomLobbyCategory({
      currentCategories: ["A", "B", "C"],
      categoryPool: ["A", "B", "C"],
      getUniqueCategoriesFn,
    });

    expect(chosen).toBe("Generated Choice");
    expect(getUniqueCategoriesFn).toHaveBeenCalledWith(1, { exclude: ["A", "B", "C"] });
  });

  it("applies a trimmed category update to the correct global board slot", () => {
    const result = applyLobbyCategoryValue({
      categories: ["A", "B", "C", "D", "E", "F", "G", "H", "I", "J", "K"],
      boardType: "secondBoard",
      index: 1,
      value: "  New Category",
    });

    expect(result.value).toBe("New Category");
    expect(result.globalIndex).toBe(6);
    expect(result.categories[6]).toBe("New Category");
    expect(result.categories[0]).toBe("A");
  });
});

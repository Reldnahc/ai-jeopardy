import { describe, expect, it } from "vitest";
import { createEmptyLockedCategories } from "./lockedCategories.js";

describe("locked categories helpers", () => {
  it("creates the expected default lock structure", () => {
    expect(createEmptyLockedCategories()).toEqual({
      firstBoard: [false, false, false, false, false],
      secondBoard: [false, false, false, false, false],
      finalJeopardy: [false],
    });
  });

  it("returns fresh arrays on each call", () => {
    const first = createEmptyLockedCategories();
    const second = createEmptyLockedCategories();

    first.firstBoard[0] = true;

    expect(second.firstBoard[0]).toBe(false);
  });
});

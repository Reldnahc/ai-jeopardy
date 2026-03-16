import type { GameState } from "../types/runtime.js";

export type LockedCategoriesState = NonNullable<GameState["lockedCategories"]>;

export function createEmptyLockedCategories(): LockedCategoriesState {
  return {
    firstBoard: Array(5).fill(false),
    secondBoard: Array(5).fill(false),
    finalJeopardy: Array(1).fill(false),
  };
}

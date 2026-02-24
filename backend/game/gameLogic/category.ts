import type { BoardClue, GameState } from "../../types/runtime.js";

export function findCategoryForClue(game: GameState, clue: BoardClue | null | undefined) {
  const boardKey = game.activeBoard || "firstBoard";
  const board = game.boardData?.[boardKey] as
    | {
        categories?: Array<{
          category?: string;
          values?: Array<{ value?: unknown; question?: string }>;
        }>;
      }
    | undefined;
  const cats = board?.categories;
  if (!Array.isArray(cats)) return null;

  const v = clue?.value;
  const q = String(clue?.question ?? "").trim();
  if (!q) return null;

  for (const cat of cats) {
    const catName = String(cat?.category ?? "").trim();
    const values = Array.isArray(cat?.values) ? cat.values : [];
    for (const c of values) {
      const sameValue = c?.value === v;
      const sameQuestion = String(c?.question ?? "").trim() === q;
      if (sameValue && sameQuestion) return catName || null;
    }
  }

  return null;
}

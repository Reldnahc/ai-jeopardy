import type { GameState } from "../../types/runtime.js";

function parseValueAsNumber(val: unknown): number {
  const n = Number(String(val || "").replace(/[^0-9]/g, ""));
  return Number.isFinite(n) ? n : 0;
}

function computeBoardMax(game: GameState, boardKey: string): number {
  const board = game.boardData?.[boardKey] as
    | { categories?: Array<{ values?: Array<{ value?: unknown }> }> }
    | undefined;
  let max = 0;
  for (const cat of board?.categories || []) {
    for (const clue of cat?.values || []) {
      const v = parseValueAsNumber(clue?.value);
      if (v > max) max = v;
    }
  }
  return max || 0;
}

export function computeDailyDoubleMaxWager(
  game: GameState,
  boardKey: string,
  playerName: string,
): number {
  const boardMax = computeBoardMax(game, boardKey);
  const score = Number(game.scores?.[playerName] || 0);
  // Jeopardy rule: max is max(boardMax, score); if score negative, still boardMax
  return Math.max(boardMax, score, 0);
}

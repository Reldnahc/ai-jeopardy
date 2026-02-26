import type { GameState } from "../types/runtime.js";

export function shouldIncrementStats(game: GameState | null | undefined): boolean {
  return !Boolean(game?.isImportedBoardGame);
}

import type { GameState } from "../../types/runtime.js";
import { applyScore } from "./helpers.js";

export function setSkipNextClue(game: GameState): boolean {
  if (!game) return false;
  game.skipNextClue = true;
  return true;
}

export function setDailyDoubleSnipeNext(game: GameState, enabled: boolean): boolean {
  if (!game) return false;
  game.ddSnipeNext = Boolean(enabled);
  return game.ddSnipeNext;
}

export function lockBuzzer(game: GameState): boolean {
  if (!game) return false;
  game.buzzerLocked = true;
  return true;
}

export function resetBuzzerState(game: GameState): number {
  game.buzzed = null;
  game.buzzerLocked = true;
  game.buzzLockouts = {};
  game.timerEndTime = null;
  game.timerVersion = (game.timerVersion || 0) + 1;
  return game.timerVersion;
}

export function markActiveBoardCluesComplete(game: GameState): string[] {
  if (!game) return [];

  if (!game.clearedClues) game.clearedClues = new Set();
  const boardKey = game.activeBoard || "firstBoard";
  const board = game.boardData?.[boardKey] as
    | { categories?: Array<{ values?: Array<{ value?: unknown; question?: unknown }> }> }
    | undefined;
  if (!board?.categories) return [];

  const added: string[] = [];
  for (const cat of board.categories) {
    for (const clue of cat.values || []) {
      const clueId = `${clue.value}-${clue.question}`;
      game.clearedClues.add(clueId);
      added.push(clueId);
    }
  }

  return added;
}

export function revealSelectedAnswer(game: GameState): boolean {
  if (!game?.selectedClue) return false;
  game.selectedClue.isAnswerRevealed = true;
  return true;
}

export function resetAnswerCaptureState(game: GameState): void {
  game.phase = null;
  game.answeringPlayerKey = null;
  game.answeringPlayerUsername = null;
  game.answerSessionId = null;
  game.answerClueKey = null;
}

export function applyManualScoreUpdate(game: GameState, username: string, delta: number): void {
  applyScore(game, username, delta);
}

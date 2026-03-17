import type { GameState } from "../../types/runtime.js";

type ClueLike = Record<string, unknown>;

export function normalizeGameValue(value: unknown): string {
  return String(value ?? "")
    .trim()
    .toLowerCase();
}

export function buildClueKey(boardKey: string, clue: ClueLike): string {
  const value = String(clue.value ?? "");
  const question = String(clue.question ?? "").trim();
  return `${boardKey}:${value}:${question}`;
}

export function applySelectedClue(args: {
  game: GameState;
  clue: ClueLike;
  findCategoryForClue: (game: GameState, clue: ClueLike) => string;
}): {
  boardKey: string;
  clueKey: string;
  clueQuestion: string;
} {
  const { game, clue, findCategoryForClue } = args;
  const category = String(clue.category ?? "").trim() || findCategoryForClue(game, clue);

  game.selectedClue = {
    ...clue,
    category: category || undefined,
    isAnswerRevealed: false,
  };

  const boardKey = game.activeBoard || "firstBoard";
  const clueKey = buildClueKey(boardKey, clue);

  return {
    boardKey,
    clueKey,
    clueQuestion: String(game.selectedClue?.question ?? "").trim(),
  };
}

export function resolveSpecialClueModes(
  game: GameState,
  boardKey: string,
  clueKey: string,
): {
  naturalDailyDouble: boolean;
  snipedDailyDouble: boolean;
  isDailyDouble: boolean;
  shouldSkip: boolean;
} {
  const ddKeys = game.boardData?.dailyDoubleClueKeys?.[boardKey] || [];
  const naturalDailyDouble = ddKeys.includes(clueKey) && !game.usedDailyDoubles?.has?.(clueKey);
  const snipedDailyDouble = Boolean(game.ddSnipeNext);

  return {
    naturalDailyDouble,
    snipedDailyDouble,
    isDailyDouble: naturalDailyDouble || snipedDailyDouble,
    shouldSkip: Boolean(game.skipNextClue),
  };
}

export function consumeDdSnipe(game: GameState): void {
  game.ddSnipeNext = false;
}

export function consumeSkippedClue(game: GameState, clue: ClueLike): string {
  game.skipNextClue = false;
  if (!game.clearedClues) game.clearedClues = new Set();

  const clueId = `${clue.value}-${clue.question}`;
  game.clearedClues.add(clueId);

  game.selectedClue = null;
  game.phase = "board";
  game.clueState = null;
  game.buzzed = null;
  game.buzzerLocked = true;
  game.buzzLockouts = {};

  return clueId;
}

export function activateLiveClue(game: GameState, clueKey: string): void {
  game.phase = "clue";
  game.clueState = { clueKey, lockedOut: {} };
  game.buzzed = null;
  game.buzzerLocked = true;
  game.buzzLockouts = {};
}

export function startDailyDoubleState(args: {
  game: GameState;
  clueKey: string;
  boardKey: string;
  playerUsername: string;
  playerDisplayname: string;
  maxWager: number;
}): void {
  const { game, clueKey, boardKey, playerUsername, playerDisplayname, maxWager } = args;
  game.dailyDouble = {
    clueKey,
    boardKey,
    playerUsername,
    playerDisplayname,
    stage: "wager_listen",
    wager: null,
    maxWager,
    attempts: 0,
  };
}

export function estimateClueSpeechMaxMs(text: string): number {
  const words = text ? text.split(/\s+/).filter(Boolean).length : 0;
  const estimate = 700 + words * 420;
  return Math.min(14_000, Math.max(2_000, estimate));
}

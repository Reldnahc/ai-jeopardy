import type { GameState, PlayerState } from "../types/runtime.js";
import type { CtxDeps } from "../ws/context.types.js";
import { appConfig } from "../config/appConfig.js";

export type StageTransitionCtx = CtxDeps<
  | "isBoardFullyCleared"
  | "aiHostVoiceSequence"
  | "broadcast"
  | "startGameTimer"
  | "checkAllWagersSubmitted"
  | "checkAllDrawingsSubmitted"
  | "clearGameTimer"
  | "repos"
  | "normalizeName"
  | "fireAndForget"
  | "getTtsDurationMs"
  | "sleepAndCheckGame"
>;

export function isBoardFullyCleared(game: GameState, boardKey: string): boolean {
  const board = game?.boardData?.[boardKey] as
    | { categories?: Array<{ values?: Array<{ value?: unknown; question?: string }> }> }
    | undefined;
  if (!board?.categories) return false;

  for (const cat of board.categories) {
    for (const clue of cat.values || []) {
      const clueId = `${clue.value}-${clue.question}`;
      if (!game.clearedClues?.has(clueId)) return false;
    }
  }
  return true;
}

export function checkBoardTransition(game: GameState, gameId: string, ctx: StageTransitionCtx): boolean {
  if (game.activeBoard === "firstBoard") {
    if (!ctx.isBoardFullyCleared(game, "firstBoard")) return false;

    void startDoubleJeopardy(game, gameId, ctx);
    return true;
  }

  if (game.activeBoard === "secondBoard") {
    if (!ctx.isBoardFullyCleared(game, "secondBoard")) return false;

    void startFinalJeopardy(game, gameId, ctx);
    return true;
  }

  return false;
}

async function startDoubleJeopardy(game: GameState, gameId: string, ctx: StageTransitionCtx) {
  ctx.broadcast(gameId, {
    type: "phase-changed",
    phase: "transition",
    selectorKey: game.selectorKey ?? null,
    selectorName: game.selectorName ?? null,
  });

  game.activeBoard = "secondBoard";

  const pad = 25;
  const players = game.players ?? [];
  const pick =
    players.length === 0
      ? null
      : players.reduce((lowest: PlayerState, p: PlayerState) => {
          const score = game.scores?.[p.name] ?? 0;
          const lowestScore = game.scores?.[lowest.name] ?? 0;

          return score < lowestScore ? p : lowest;
        });

  if (pick) {
    game.selectorKey = pick.username;
    game.selectorName = pick.displayname;
  } else {
    game.selectorKey = null;
    game.selectorName = null;
  }
  const selectorName = String(game.selectorName ?? "").trim();

  await ctx.aiHostVoiceSequence(ctx, gameId, game, [
    { slot: "double_jeopardy", pad },
    {
      slot: "double_jeopardy2",
      pad,
      after: () => ctx.broadcast(gameId, { type: "transition-to-second-board" }),
    },
    { slot: selectorName, pad },
    { slot: "your_up", pad },
  ]);

  ctx.broadcast(gameId, {
    type: "phase-changed",
    phase: "board",
    selectorKey: game.selectorKey ?? null,
    selectorName: game.selectorName ?? null,
  });

  if (game.boardSelectionLocked) {
    game.boardSelectionLocked = false;
    game.boardSelectionLockReason = null;
    ctx.broadcast(gameId, {
      type: "board-selection-unlocked",
      lockVersion: game.boardSelectionLockVersion || 0,
    });
  }
}

function getExpectedFinalists(game: GameState): PlayerState[] {
  const players = Array.isArray(game?.players) ? game.players : [];
  return players.filter((p: PlayerState) => {
    const score = Number(game.scores?.[p.username] ?? 0);
    const online = p?.online !== false; // default true
    return score > 0 && online;
  });
}

/**
 * Cache the finalist list for the whole Final Jeopardy run.
 * Prevents weirdness if scores/online flags change mid-phase.
 */
function getFinalistNames(game: GameState): string[] {
  if (Array.isArray(game?.finalJeopardyFinalists)) return game.finalJeopardyFinalists;
  const names = getExpectedFinalists(game).map((p: PlayerState) => p.username);
  game.finalJeopardyFinalists = names;
  return names;
}

async function startFinalJeopardy(game: GameState, gameId: string, ctx: StageTransitionCtx) {
  game.activeBoard = "finalJeopardy";
  game.isFinalJeopardy = true;
  game.finalJeopardyStage = "wager";

  game.wagers = {};
  game.finalWagerDrawings = {};
  game.drawings = {};
  game.finalPlacements = [];

  // Cache finalists for this FJ run
  const finalists = getFinalistNames(game);

  const pad = 25;

  await ctx.aiHostVoiceSequence(ctx, gameId, game, [
    { slot: "final_jeopardy", pad },
    // Include finalists so clients can hide wager/draw UI for non-finalists
    {
      slot: "final_jeopardy2",
      pad,
      after: () => ctx.broadcast(gameId, { type: "final-jeopardy", finalists }),
    },
    { slot: "all_wager", pad },
  ]);

  const WAGER_SECONDS = Math.max(1, Math.floor(appConfig.gameplay.finalWagerSeconds));

  ctx.startGameTimer(gameId, game, ctx, WAGER_SECONDS, "final-wager", () => {
    // Only act if we're still in FJ wager stage
    if (!game?.isFinalJeopardy) return;
    if (game.finalJeopardyStage !== "wager") return;

    const expected = getFinalistNames(game);
    if (!game.wagers) game.wagers = {};
    if (!game.finalWagerDrawings) game.finalWagerDrawings = {};

    // If player didn't submit, wager defaults to 0
    for (const name of expected) {
      if (!Object.prototype.hasOwnProperty.call(game.wagers, name)) {
        game.wagers[name] = 0;
      }
      if (!Object.prototype.hasOwnProperty.call(game.finalWagerDrawings, name)) {
        game.finalWagerDrawings[name] = "";
      }
    }

    ctx.checkAllWagersSubmitted(game, gameId, ctx);
  });
}

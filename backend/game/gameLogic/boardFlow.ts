import type { GameState } from "../../types/runtime.js";
import type { Ctx } from "../../ws/context.types.js";

function lockBoardSelection(ctx: Ctx, gameId: string, game: GameState): number {
  if (!game) return 0;

  game.boardSelectionLocked = true;
  game.boardSelectionLockVersion = (game.boardSelectionLockVersion || 0) + 1;

  ctx.broadcast(gameId, {
    type: "board-selection-locked",
    lockVersion: game.boardSelectionLockVersion,
  });

  return game.boardSelectionLockVersion;
}

function unlockBoardSelection(ctx: Ctx, gameId: string, game: GameState, lockVersion?: number) {
  if (!game) return;

  if (typeof lockVersion === "number" && lockVersion > 0) {
    if ((game.boardSelectionLockVersion || 0) !== lockVersion) return;
  }

  if (!game.boardSelectionLocked) return;

  game.boardSelectionLocked = false;
  game.boardSelectionLockReason = null;

  ctx.broadcast(gameId, {
    type: "board-selection-unlocked",
    lockVersion: game.boardSelectionLockVersion || 0,
  });
}

function returnToBoard(game: GameState, gameId: string, ctx: Ctx, transitioned = false) {
  game.selectedClue = null;
  game.buzzed = null;
  game.buzzerLocked = true;
  game.phase = "board";
  game.clueState = null;

  const selectorName = String(game.selectorName || "").trim();
  const lockVersion = lockBoardSelection(ctx, gameId, game);

  ctx.broadcast(gameId, {
    type: "phase-changed",
    phase: "board",
    selectorKey: game.selectorKey ?? null,
    selectorName: game.selectorName ?? null,
  });

  ctx.broadcast(gameId, {
    type: "returned-to-board",
    selectedClue: null,
    boardSelectionLocked: game.boardSelectionLocked,
  });

  const announceSelector = async () => {
    const pad = 25;

    await ctx.aiHostVoiceSequence(ctx, gameId, game, [
      { slot: selectorName, pad },
      { slot: "your_up", pad, after: () => unlockBoardSelection(ctx, gameId, game, lockVersion) },
    ]);
  };

  if (!transitioned) {
    ctx.fireAndForget(announceSelector(), "announcing selector");
  }
}

export function finishClueAndReturnToBoard(ctx: Ctx, gameId: string, game: GameState) {
  if (!game) return;

  if (game.selectedClue) {
    if (!game.clearedClues) game.clearedClues = new Set();

    const clueId = `${game.selectedClue.value}-${game.selectedClue.question}`;
    game.clearedClues.add(clueId);

    ctx.broadcast(gameId, { type: "clue-cleared", clueId });
    ctx.broadcast(gameId, { type: "daily-double-hide-modal" });

    const transitioned = ctx.checkBoardTransition(game, gameId, ctx);
    returnToBoard(game, gameId, ctx, transitioned);
    return;
  }

  returnToBoard(game, gameId, ctx);
}

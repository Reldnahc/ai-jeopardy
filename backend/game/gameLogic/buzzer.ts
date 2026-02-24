import type { GameState } from "../../types/runtime.js";
import type { Ctx } from "../../ws/context.types.js";
import { finishClueAndReturnToBoard } from "./boardFlow.js";

export function cancelAutoUnlock(game: GameState) {
  if (game?.autoUnlockTimer) {
    clearTimeout(game.autoUnlockTimer);
    game.autoUnlockTimer = null;
  }
  game.autoUnlockClueKey = null;
}

export function doUnlockBuzzerAuthoritative(gameId: string, game: GameState, ctx: Ctx) {
  if (!game) return;

  ctx.clearGameTimer(game, gameId, ctx);

  if (!game.clueState) game.clueState = {};
  game.clueState.buzzOpenAtMs = Date.now();

  game.buzzerLocked = false;
  ctx.broadcast(gameId, { type: "buzzer-unlocked" });

  if (game.pendingBuzz?.timer) clearTimeout(game.pendingBuzz.timer);
  game.pendingBuzz = null;
  game.buzzed = null;

  if (game.timeToBuzz === -1) return;

  ctx.startGameTimer(
    gameId,
    game,
    ctx,
    game.timeToBuzz,
    "buzz",
    ({ gameId, game }: { gameId: string; game: GameState }) => {
      if (!game) return;
      if (!game.selectedClue) return;

      if (game.buzzerLocked || game.buzzed) return;

      game.buzzerLocked = true;
      ctx.broadcast(gameId, { type: "buzzer-locked" });

      (async () => {
        const revealAnswer = async () => {
          game.selectedClue.isAnswerRevealed = true;
          ctx.broadcast(gameId, { type: "answer-revealed", clue: game.selectedClue });
        };

        const finish = async () => {
          const lockedPlayers = game.clueState?.lockedOut ?? {};

          for (const player of game.players) {
            const isLocked = lockedPlayers[player.username] === true;

            if (!isLocked) {
              ctx.fireAndForget(
                ctx.repos.profiles.incrementCluesSkipped(player.username),
                "incrementCluesSkipped",
              );
            }
          }

          await ctx.sleepAndCheckGame(1000, gameId);
          finishClueAndReturnToBoard(ctx, gameId, game);
        };

        const clueKey = ctx.getClueKey(game, game.selectedClue);
        const assetId = game.boardData?.ttsByAnswerKey?.[clueKey] || null;
        await ctx.aiHostVoiceSequence(ctx, gameId, game, [
          { slot: "nobody", after: revealAnswer },
          { slot: "answer_was" },
          { assetId, after: finish },
        ]);
      })();
    },
  );
}

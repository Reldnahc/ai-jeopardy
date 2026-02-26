import type { GameState, PlayerState } from "../../types/runtime.js";
import type { CtxDeps } from "../../ws/context.types.js";
import { finishClueAndReturnToBoard } from "./boardFlow.js";
import type { BuzzerCtx } from "./buzzer.js";
import { shouldIncrementStats } from "../statsGate.js";
import {
  applyScore,
  displaynameFor,
  getActiveClueWorth,
  isDailyDoubleActiveForCurrentClue,
  normUsername,
} from "./helpers.js";

export type ResolverCtx = BuzzerCtx & CtxDeps<"clearAnswerWindow" | "sleep" | "doUnlockBuzzerAuthoritative">;

export async function autoResolveAfterJudgement(
  ctx: ResolverCtx,
  gameId: string,
  game: GameState,
  username: string,
  verdict: string,
) {
  if (!game || !game.selectedClue) return;

  const u = normUsername(username);
  if (!u) return;

  const worth = getActiveClueWorth(game);
  const delta = verdict === "correct" ? worth : verdict === "incorrect" ? -worth : 0;

  if (verdict === "correct" || verdict === "incorrect") {
    applyScore(game, u, delta);
    ctx.broadcast(gameId, { type: "update-scores", scores: game.scores });
  }

  const ddActive = isDailyDoubleActiveForCurrentClue(game);
  const disp = displaynameFor(game, u);
  const allowStats = shouldIncrementStats(game);

  if (verdict === "correct") {
    game.selectedClue.isAnswerRevealed = true;

    if (allowStats) {
      ctx.fireAndForget(ctx.repos.profiles.incrementCorrectAnswers(u), "Increment correct answer");
    }

    const alive = await ctx.aiHostVoiceSequence(ctx, gameId, game, [
      {
        slot: "correct",
        after: () => ctx.broadcast(gameId, { type: "answer-revealed", clue: game.selectedClue }),
      },
    ]);
    if (!alive) return;

    game.selectorKey = u;
    game.selectorName = disp;

    if (ddActive) {
      game.dailyDouble = null;
      if (allowStats) {
        ctx.fireAndForget(
          ctx.repos.profiles.incrementDailyDoubleCorrect(u),
          "Increment Daily Double correct answer",
        );
      }
    }

    await ctx.sleep(3000);
    finishClueAndReturnToBoard(ctx, gameId, game);
    return;
  }

  if (allowStats) {
    ctx.fireAndForget(ctx.repos.profiles.incrementWrongAnswers(u), "Increment wrong answer");
  }

  if (ddActive) {
    game.buzzerLocked = true;
    ctx.broadcast(gameId, { type: "buzzer-locked" });

    const revealAnswer = async () => {
      game.selectedClue.isAnswerRevealed = true;
      ctx.broadcast(gameId, { type: "answer-revealed", clue: game.selectedClue });
    };

    const clueKey = ctx.getClueKey(game, game.selectedClue);
    const assetId = game.boardData?.ttsByAnswerKey?.[clueKey] || null;

    await ctx.aiHostVoiceSequence(ctx, gameId, game, [
      { slot: "incorrect" },
      { slot: "answer_was", after: revealAnswer },
      { assetId },
    ]);

    game.dailyDouble = null;

    finishClueAndReturnToBoard(ctx, gameId, game);
    return;
  }

  if (game.clueState?.lockedOut) game.clueState.lockedOut[u] = true;

  game.buzzed = null;
  game.answeringPlayerKey = null;
  game.answerSessionId = null;
  game.answerClueKey = null;
  game.answerTranscript = game.answerTranscript ?? "";
  game.answerVerdict = "incorrect";

  ctx.clearAnswerWindow(game);
  ctx.clearGameTimer(game, gameId, ctx);

  const players = game.players || [];
  const anyoneLeft = players.some((pp: PlayerState) => {
    const id = normUsername(pp?.username);
    if (!id) return false;
    return !game.clueState?.lockedOut?.[id];
  });

  if (!anyoneLeft) {
    game.buzzerLocked = true;
    ctx.broadcast(gameId, { type: "buzzer-locked" });

    const revealAnswer = async () => {
      game.selectedClue.isAnswerRevealed = true;
      ctx.broadcast(gameId, { type: "answer-revealed", clue: game.selectedClue });
    };

    const clueKey = ctx.getClueKey(game, game.selectedClue);
    const assetId = game.boardData?.ttsByAnswerKey?.[clueKey] || null;

    await ctx.aiHostVoiceSequence(ctx, gameId, game, [
      { slot: "incorrect" },
      { slot: "answer_was", after: revealAnswer },
      { assetId },
    ]);

    finishClueAndReturnToBoard(ctx, gameId, game);
    return;
  }

  game.buzzerLocked = true;
  ctx.broadcast(gameId, { type: "buzzer-locked" });

  await ctx.aiHostVoiceSequence(ctx, gameId, game, [
    { slot: "incorrect", pad: 1000 },
    {
      slot: "rebuzz",
      pad: 700,
      after: () => {
        ctx.broadcast(gameId, { type: "buzzer-ui-reset" });
        ctx.doUnlockBuzzerAuthoritative(gameId, game, ctx);
      },
    },
  ]);
}

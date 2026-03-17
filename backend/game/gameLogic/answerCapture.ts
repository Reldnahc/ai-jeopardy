import type { GameState } from "../../types/runtime.js";
import type { CtxDeps } from "../../ws/context.types.js";
import {
  applyAnswerResult,
  buildAnswerResultPayload,
  resolveSuggestedDelta,
} from "./answerSubmission.js";

export type AnswerCaptureCtx = CtxDeps<
  | "games"
  | "broadcast"
  | "clearAnswerWindow"
  | "startGameTimer"
  | "startAnswerWindow"
  | "autoResolveAfterJudgement"
>;

function createAnswerSessionId(): string {
  return `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

function getAnswerDurationMs(game: GameState): { answerSeconds: number; recordMs: number } {
  const answerSeconds =
    typeof game.timeToAnswer === "number" && game.timeToAnswer > 0 ? game.timeToAnswer : 9;
  return {
    answerSeconds,
    recordMs: answerSeconds * 1000,
  };
}

export function startAnswerCapture(args: {
  ctx: AnswerCaptureCtx;
  gameId: string;
  game: GameState;
  playerUsername: string;
  playerDisplayname: string | null;
  clueKey: string;
  onAutoResolveError?: (error: unknown) => void;
}): void {
  const { ctx, gameId, game, playerUsername, playerDisplayname, clueKey, onAutoResolveError } =
    args;
  const { answerSeconds, recordMs } = getAnswerDurationMs(game);
  const deadlineAt = Date.now() + recordMs;

  game.phase = "ANSWER_CAPTURE";
  game.answeringPlayerUsername = playerUsername;
  game.answeringPlayerKey = playerUsername;
  game.answerClueKey = clueKey;
  game.answerSessionId = createAnswerSessionId();
  game.answerTranscript = null;
  game.answerVerdict = null;
  game.answerConfidence = null;

  ctx.clearAnswerWindow(game);

  ctx.broadcast(gameId, {
    type: "answer-capture-start",
    gameId,
    username: playerUsername,
    displayname: playerDisplayname,
    answerSessionId: game.answerSessionId,
    clueKey,
    durationMs: recordMs,
    deadlineAt,
  });

  if (answerSeconds > 0) {
    ctx.startGameTimer(gameId, game, ctx, answerSeconds, "answer");
  }

  const activeSessionId = game.answerSessionId;
  const activePlayerKey = game.answeringPlayerKey;
  ctx.startAnswerWindow(gameId, game, ctx.broadcast, recordMs, () => {
    handleAnswerCaptureTimeout({
      ctx,
      gameId,
      sourceGame: game,
      answerSessionId: activeSessionId,
      playerUsername,
      playerDisplayname,
      answeringPlayerKey: activePlayerKey,
      onAutoResolveError,
    });
  });
}

export function handleAnswerCaptureTimeout(args: {
  ctx: AnswerCaptureCtx;
  gameId: string;
  sourceGame: GameState;
  answerSessionId: string | null | undefined;
  playerUsername: string;
  playerDisplayname: string | null;
  answeringPlayerKey: string | null | undefined;
  onAutoResolveError?: (error: unknown) => void;
}): void {
  const {
    ctx,
    gameId,
    sourceGame,
    answerSessionId,
    playerUsername,
    playerDisplayname,
    answeringPlayerKey,
    onAutoResolveError,
  } = args;

  const game = ctx.games?.[gameId];
  if (!game) return;
  if (!game.answerSessionId) return;
  if (game.answerSessionId !== answerSessionId) return;
  if (game.answeringPlayerKey !== answeringPlayerKey) return;
  if (!game.selectedClue) return;

  applyAnswerResult({
    game,
    verdict: "incorrect",
    transcript: "",
    confidence: 0.0,
  });

  ctx.broadcast(
    gameId,
    buildAnswerResultPayload({
      gameId,
      answerSessionId: game.answerSessionId,
      playerUsername,
      playerDisplayname,
      transcript: "",
      verdict: "incorrect",
      confidence: 0.0,
      suggestedDelta: resolveSuggestedDelta(game, "incorrect"),
    }),
  );

  ctx
    .autoResolveAfterJudgement(
      ctx as unknown as Parameters<typeof ctx.autoResolveAfterJudgement>[0],
      gameId,
      game,
      sourceGame.answeringPlayerKey,
      "incorrect",
    )
    .catch((error: unknown) => {
      if (typeof onAutoResolveError === "function") {
        onAutoResolveError(error);
      }
    });
}

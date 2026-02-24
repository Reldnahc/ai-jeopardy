import type { GameState } from "../../types/runtime.js";
import type { CtxDeps } from "../../ws/context.types.js";
import { finalizeDailyDoubleWagerAndStartClue } from "./finalize.js";
import type { DailyDoubleFinalizeCtx } from "./finalize.js";

export type DailyDoubleCaptureCtx = DailyDoubleFinalizeCtx & CtxDeps<"clearDdWagerTimer">;

function makeSessionId() {
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export function clearDdWagerTimer(ctx: DailyDoubleCaptureCtx, gameId: string, game: GameState) {
  if (game._ddWagerTimer) {
    clearTimeout(game._ddWagerTimer);
  }
  game._ddWagerTimer = null;
  ctx.broadcast(gameId, {
    type: "timer-end",
    timerVersion: ctx.games[gameId]?.timerVersion || 0,
  });
}

function armDdWagerTimer(
  gameId: string,
  game: GameState,
  ctx: DailyDoubleCaptureCtx,
  ddWagerSessionId: string,
  durationMs: number,
) {
  clearDdWagerTimer(ctx, gameId, game);

  console.log("[DD] armDdWagerTimer", { gameId, ddWagerSessionId, durationMs });

  const padMs = 250;

  game._ddWagerTimer = setTimeout(async () => {
    console.log("[DD] wager timer fired", { gameId, ddWagerSessionId });

    const g = ctx.games?.[gameId];
    if (!g?.dailyDouble) return;
    if (g.phase !== "DD_WAGER_CAPTURE") return;
    if (g.ddWagerSessionId !== ddWagerSessionId) return;
    if (g.dailyDouble.wager != null) return;

    await repromptDdWager(gameId, g, ctx, { reason: "timeout" });
  }, durationMs + padMs);
}

export async function repromptDdWager(
  gameId: string,
  game: GameState,
  ctx: DailyDoubleCaptureCtx,
  args: { reason?: string } | null,
) {
  const dd = game.dailyDouble;
  if (!dd) return;

  const maxAttempts = 10;
  dd.attempts = (dd.attempts || 0) + 1;

  // If we've tried enough, choose a fallback and continue
  if (dd.attempts > maxAttempts) {
    clearDdWagerTimer(ctx, gameId, game);
    const fallbackWager = 0;
    dd.wager = fallbackWager;
    dd.stage = "clue";

    game.phase = "clue";
    game.ddWagerSessionId = null;
    game.ddWagerDeadlineAt = null;

    ctx.broadcast(gameId, {
      type: "daily-double-wager-locked",
      gameId,
      username: dd.playerUsername,
      displayname: dd.playerDisplayname,
      wager: fallbackWager,
      fallback: true,
      reason: args?.reason || "parse-failed",
    });

    return await finalizeDailyDoubleWagerAndStartClue(gameId, game, ctx, {
      fallbackWager,
      fallback: false,
      reason: null,
    });
  }

  ctx.broadcast(gameId, {
    type: "daily-double-wager-parse-failed",
    gameId,
    username: dd.playerUsername,
    displayname: dd.playerDisplayname,
    reason: args?.reason || "no-number",
    attempts: dd.attempts,
    maxAttempts,
  });

  await ctx.aiHostVoiceSequence(ctx, gameId, game, [
    { slot: "i_didnt_catch_that" },
    { slot: "say_wager_again" },
  ]);

  // Restart capture with a new session id (prevents stale audio blobs)
  startDdWagerCapture(gameId, game, ctx);
}

export function startDdWagerCapture(gameId: string, game: GameState, ctx: DailyDoubleCaptureCtx) {
  const dd = game.dailyDouble;
  if (!dd) return;

  if (typeof dd.attempts !== "number") dd.attempts = 0;

  const durationMs = 10000;
  const deadlineAt = Date.now() + durationMs;
  const ddWagerSessionId = makeSessionId();

  dd.stage = "wager_listen";
  dd.wager = null;
  dd.ddWagerSessionId = ddWagerSessionId;
  dd.ddWagerDeadlineAt = deadlineAt;

  game.phase = "DD_WAGER_CAPTURE";
  game.ddWagerSessionId = ddWagerSessionId;
  game.ddWagerDeadlineAt = deadlineAt;

  clearDdWagerTimer(ctx, gameId, game);
  armDdWagerTimer(gameId, game, ctx, ddWagerSessionId, durationMs);

  ctx.broadcast(gameId, {
    type: "daily-double-wager-capture-start",
    gameId,
    ddWagerSessionId,
    username: dd.playerUsername,
    displayname: dd.playerDisplayname,
    durationMs,
    deadlineAt,
    attempts: dd.attempts,
  });

  ctx.startGameTimer(gameId, game, ctx, Math.ceil(durationMs / 1000), "wager");
}

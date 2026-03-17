import type { GameState } from "../../types/runtime.js";
import type { CtxDeps } from "../../ws/context.types.js";
import type { ResolverCtx } from "../gameLogic/resolver.js";
import { shouldIncrementStats } from "../statsGate.js";
import { startAnswerCapture } from "../gameLogic/answerCapture.js";

export type DailyDoubleFinalizeCtx = ResolverCtx &
  CtxDeps<"clearDdWagerTimer" | "startAnswerWindow" | "games" | "autoResolveAfterJudgement">;

export async function finalizeDailyDoubleWagerAndStartClue(
  gameId: string,
  game: GameState,
  ctx: DailyDoubleFinalizeCtx,
  args: {
    wager?: number;
    fallback?: boolean;
    reason?: string | null;
    fallbackWager?: number;
  } | null,
) {
  const { wager, fallback = false, reason = null } = args || {};

  const dd = game.dailyDouble;
  if (!dd) return;

  // Lock wager + mark DD used
  dd.wager = Number(wager || 0);
  dd.stage = "clue";

  if (dd.wager === dd.maxWager && shouldIncrementStats(game)) {
    ctx.fireAndForget(
      ctx.repos.profiles.incrementTrueDailyDoubles(dd.playerUsername),
      "Increment true Daily Double",
    );
  }

  if (!game.usedDailyDoubles) game.usedDailyDoubles = new Set();
  game.usedDailyDoubles.add(dd.clueKey);

  // Exit wager capture phase (important to prevent lockups / stale audio)
  game.phase = "clue";
  game.ddWagerSessionId = null;
  game.ddWagerDeadlineAt = null;

  // Clear any DD wager timer + end any UI timer
  ctx.clearDdWagerTimer(ctx, gameId, game);

  // Let clients know wager is locked (works for both normal + fallback)
  ctx.broadcast(gameId, {
    type: "daily-double-wager-locked",
    gameId,
    username: dd.playerUsername,
    displayname: dd.playerDisplayname,
    wager: dd.wager,
    fallback: Boolean(fallback),
    reason: reason || null,
  });

  // Reveal clue UI in a consistent way (no unlock buzzer in DD)
  ctx.broadcast(gameId, { type: "buzzer-ui-reset" });
  ctx.broadcast(gameId, { type: "buzzer-locked" });
  ctx.broadcast(gameId, {
    type: "clue-selected",
    clue: game.selectedClue,
    clearedClues: Array.from(game.clearedClues),
  });

  // Read the clue (DD path: don't unlock buzzer)
  const clueKey = dd.clueKey;
  const ttsAssetId = game.boardData?.ttsByClueKey?.[clueKey] || null;

  await ctx.aiHostVoiceSequence(ctx, gameId, game, [
    { slot: `for ${dd.wager}` },
    { assetId: ttsAssetId },
  ]);

  startAnswerCapture({
    ctx,
    gameId,
    game,
    playerUsername: dd.playerUsername,
    playerDisplayname: dd.playerDisplayname,
    clueKey,
    onAutoResolveError: (error: unknown) =>
      console.error("[dd-answer-timeout] autoResolve failed:", error),
  });
}

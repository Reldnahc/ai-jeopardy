import type { GameState } from "../../types/runtime.js";
import type { CtxDeps } from "../../ws/context.types.js";
import type { ResolverCtx } from "../gameLogic/resolver.js";

export type DailyDoubleFinalizeCtx = ResolverCtx &
  CtxDeps<"clearDdWagerTimer" | "startAnswerWindow" | "games" | "parseClueValue" | "autoResolveAfterJudgement">;

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

  if (dd.wager === dd.maxWager) {
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

  // Start server-authoritative answer capture session (same as your current DD flow)
  const answerSeconds =
    typeof game.timeToAnswer === "number" && game.timeToAnswer > 0 ? game.timeToAnswer : 9;

  const recordMs = answerSeconds * 1000;
  const deadlineAt = Date.now() + recordMs;

  game.phase = "ANSWER_CAPTURE";
  game.answeringPlayerUsername = dd.playerUsername;
  game.answerClueKey = clueKey;
  game.answerSessionId = `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
  game.answerTranscript = null;
  game.answerVerdict = null;
  game.answerConfidence = null;

  ctx.clearAnswerWindow(game);

  ctx.broadcast(gameId, {
    type: "answer-capture-start",
    gameId,
    username: dd.playerUsername,
    displayname: dd.playerDisplayname,
    answerSessionId: game.answerSessionId,
    clueKey,
    durationMs: recordMs,
    deadlineAt,
  });

  if (answerSeconds > 0) {
    ctx.startGameTimer(gameId, game, ctx, answerSeconds, "answer");
  }

  ctx.startAnswerWindow(gameId, game, ctx.broadcast, recordMs, () => {
    const g = ctx.games?.[gameId];
    if (!g) return;

    if (!g.answerSessionId) return;
    if (g.answerSessionId !== game.answerSessionId) return;
    if (g.answeringPlayerKey !== game.answeringPlayerKey) return;
    if (!g.selectedClue) return;

    g.phase = "RESULT";
    g.answerTranscript = "";
    g.answerVerdict = "incorrect";
    g.answerConfidence = 0.0;

    const ddWorth =
      g.dailyDouble?.clueKey === g.clueState?.clueKey &&
      Number.isFinite(Number(g.dailyDouble?.wager))
        ? Number(g.dailyDouble.wager)
        : null;

    const clueValue = ctx.parseClueValue(g.selectedClue?.value);
    const worth = ddWorth !== null ? ddWorth : clueValue;

    ctx.broadcast(gameId, {
      type: "answer-result",
      gameId,
      answerSessionId: g.answerSessionId,
      username: dd.playerUsername,
      displayname: dd.playerDisplayname,
      transcript: "",
      verdict: "incorrect",
      confidence: 0.0,
      suggestedDelta: -worth,
    });

    ctx
      .autoResolveAfterJudgement(ctx, gameId, g, game.answeringPlayerKey, "incorrect")
      .catch((e: unknown) => console.error("[dd-answer-timeout] autoResolve failed:", e));
  });
}

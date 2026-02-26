import { appConfig } from "../../config/appConfig.js";
import type { GameState } from "../../types/runtime.js";
import type { CtxDeps } from "../../ws/context.types.js";
import { shouldIncrementStats } from "../statsGate.js";
import {
  applyFinalJeopardyScoring,
  buildPodiumPayoutScores,
  computeFinalTop,
  ensureFinalResponseStores,
  getFinalistUsernames,
} from "./helpers.js";

export type FinalJeopardyPhasesCtx = CtxDeps<
  | "clearGameTimer"
  | "broadcast"
  | "aiHostVoiceSequence"
  | "startGameTimer"
  | "checkAllDrawingsSubmitted"
  | "normalizeName"
  | "repos"
  | "fireAndForget"
  | "getTtsDurationMs"
  | "sleepAndCheckGame"
>;

export async function advanceToDrawingPhase(
  game: GameState,
  gameId: string,
  wagers: Record<string, number>,
  ctx: FinalJeopardyPhasesCtx,
) {
  ctx.clearGameTimer(game, gameId, ctx);

  game.finalJeopardyStage = "drawing";

  const finalists = getFinalistUsernames(game);
  ctx.broadcast(gameId, {
    type: "all-wagers-submitted",
    wagers,
    finalists,
    wagerDrawings: game.finalWagerDrawings || {},
  });

  const fjCat = game.boardData?.finalJeopardy?.categories?.[0] || null;
  const fjClueRaw = fjCat?.values?.[0] || null;
  if (!fjClueRaw) {
    console.error("[FinalJeopardy] Missing final clue in boardData");
    return;
  }

  game.selectedClue = {
    value: typeof fjClueRaw.value === "number" ? fjClueRaw.value : 0,
    question: String(fjClueRaw.question || ""),
    answer: String(fjClueRaw.answer || ""),
    isAnswerRevealed: false,
    media: fjClueRaw.media || undefined,
    category: String(fjCat?.category || "").trim() || undefined,
  };

  game.phase = "clue";
  game.buzzerLocked = true;
  game.buzzed = null;
  game.buzzLockouts = {};
  ctx.broadcast(gameId, { type: "buzzer-locked" });
  ctx.broadcast(gameId, { type: "buzzer-ui-reset" });

  const selectClue = () => {
    ctx.broadcast(gameId, {
      type: "clue-selected",
      clue: game.selectedClue,
      clearedClues: Array.from(game.clearedClues || []),
      finalists: getFinalistUsernames(game),
    });
  };

  const pad = 25;

  const drawSeconds = appConfig.gameplay.drawSeconds;

  const assetId =
    game.boardData?.ttsByClueKey?.[`finalJeopardy:?:${game.selectedClue.question?.trim()}`] || null;

  const alive = await ctx.aiHostVoiceSequence(ctx, gameId, game, [
    { slot: "todays_clue", pad, after: selectClue },
    { assetId, pad },
    { slot: "you_have", pad },
  ]);
  if (!alive) return;

  ctx.startGameTimer(gameId, game, ctx, drawSeconds, "final-draw", () => {
    if (!game?.isFinalJeopardy) return;
    if (game.finalJeopardyStage !== "drawing") return;

    const expected = getFinalistUsernames(game);
    ensureFinalResponseStores(game);

    for (const username of expected) {
      if (!Object.prototype.hasOwnProperty.call(game.drawings, username)) {
        game.drawings[username] = "";
        game.finalVerdicts[username] = "incorrect";
        game.finalTranscripts[username] = "";
      }
    }

    checkAllDrawingsSubmitted(game, gameId, ctx);
  });
}

export async function finishGame(
  game: GameState,
  gameId: string,
  drawings: Record<string, string>,
  ctx: FinalJeopardyPhasesCtx,
) {
  ctx.clearGameTimer(game, gameId, ctx);

  game.finalJeopardyStage = "finale";
  ctx.broadcast(gameId, { type: "all-drawings-submitted", drawings });
  const pad = 25;

  const wagers = game.wagers || {};
  const verdicts = game.finalVerdicts || {};
  const finalists = getFinalistUsernames(game);
  applyFinalJeopardyScoring(game, finalists, ctx);

  const top = computeFinalTop(game, finalists);
  game.finalPlacements = top.map((p) => p.username);

  console.log(top);

  let alive = await ctx.aiHostVoiceSequence(ctx, gameId, game, [{ slot: "final_jeopardy_finale", pad }]);
  if (!alive) return;

  for (let i = top.length - 1; i >= 0; i--) {
    const username = top[i].username;
    const displayname = top[i].displayname;

    const maybeRevealAnswer = () => {
      if (verdicts[username] === "correct" && !game.selectedClue?.isAnswerRevealed) {
        game.selectedClue.isAnswerRevealed = true;
        ctx.broadcast(gameId, { type: "answer-revealed", clue: game.selectedClue });
      }
    };

    const updateScore = async () => {
      ctx.broadcast(gameId, { type: "update-score", username, score: top[i].score });
    };

    const revealWager = async () => {
      ctx.broadcast(gameId, { type: "reveal-finalist-wager" });
    };

    ctx.broadcast(gameId, { type: "display-finalist", finalist: username });

    const wager = Number(wagers[username] ?? 0);
    const sizeSuffix = wager > 5000 ? "lg" : "sm";
    const followupSlot = (verdicts[username] || "incorrect") + "_followup_" + sizeSuffix;

    alive = await ctx.aiHostVoiceSequence(ctx, gameId, game, [
      { slot: "final_jeopardy_finale2", pad },
      { slot: displayname, pad },
      { slot: "fja" + displayname, pad, after: maybeRevealAnswer },
      { slot: verdicts[username] || "incorrect", pad },
      { slot: "their_wager_was", pad, after: revealWager },
      { slot: "fjw" + displayname, pad, after: updateScore },
      { slot: followupSlot, pad },
    ]);
    if (!alive) return;
  }

  if (!game.selectedClue?.isAnswerRevealed) {
    alive = await ctx.aiHostVoiceSequence(ctx, gameId, game, [{ slot: "nobody_final_jeopardy", pad }]);
    if (!alive) return;

    game.selectedClue.isAnswerRevealed = true;
    ctx.broadcast(gameId, { type: "answer-revealed", clue: game.selectedClue });
  }

  if (top[0]) {
    alive = await ctx.aiHostVoiceSequence(ctx, gameId, game, [
      { slot: "final_jeopardy_end", pad },
      { slot: top[0].displayname, pad },
      { slot: "final_jeopardy_end2", pad },
    ]);
    if (!alive) return;
  }

  game.scores = buildPodiumPayoutScores(game, top);

  const usernames = new Set();
  for (const p of game.players || []) usernames.add(ctx.normalizeName(p.username));
  for (const p of top.slice(0, 3)) if (p) usernames.add(ctx.normalizeName(p.username));

  const idByUsername = new Map();
  await Promise.all(
    [...usernames].map(async (u: string) => {
      const id = await ctx.repos.profiles.getIdByUsername(u);
      idByUsername.set(u, id);
    }),
  );

  if (shouldIncrementStats(game)) {
    if (top[0]) {
      const username = ctx.normalizeName(top[0].username);
      ctx.fireAndForget(ctx.repos.profiles.incrementGamesWon(username), "incrementGamesWon");
      ctx.fireAndForget(ctx.repos.profiles.addMoneyWon(username, top[0].score), "addMoneyWon:winner");
    }

    if (top[1]) {
      const username = ctx.normalizeName(top[1].username);
      ctx.fireAndForget(ctx.repos.profiles.addMoneyWon(username, 3000), "addMoneyWon:second");
    }

    if (top[2]) {
      const username = ctx.normalizeName(top[2].username);
      ctx.fireAndForget(ctx.repos.profiles.addMoneyWon(username, 2000), "addMoneyWon:third");
    }

    for (const p of game.players || []) {
      const username = ctx.normalizeName(p.username);
      ctx.fireAndForget(ctx.repos.profiles.incrementGamesFinished(username), "incrementGamesFinished");
    }
  }

  ctx.broadcast(gameId, { type: "update-scores", scores: game.scores });
  ctx.broadcast(gameId, {
    type: "final-score-screen",
    finalPlacements: game.finalPlacements || [],
  });
}

export function checkAllWagersSubmitted(game: GameState, gameId: string, ctx: FinalJeopardyPhasesCtx) {
  if (!game?.isFinalJeopardy) return;
  if (game.finalJeopardyStage !== "wager") return;

  const expected = getFinalistUsernames(game);
  const wagers = game.wagers || {};

  const allSubmitted =
    expected.length === 0 ||
    expected.every((name: string) => Object.prototype.hasOwnProperty.call(wagers, name));

  if (allSubmitted) {
    void advanceToDrawingPhase(game, gameId, wagers, ctx);
  }
}

export function checkAllDrawingsSubmitted(game: GameState, gameId: string, ctx: FinalJeopardyPhasesCtx) {
  if (!game?.isFinalJeopardy) return null;
  if (game.finalJeopardyStage !== "drawing") return null;

  const expected = getFinalistUsernames(game);
  const drawings = game.drawings || {};

  const allSubmitted =
    expected.length === 0 ||
    expected.every((name: string) => Object.prototype.hasOwnProperty.call(drawings, name));

  if (allSubmitted) {
    void finishGame(game, gameId, drawings, ctx);
  }
}

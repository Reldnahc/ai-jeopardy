import type { GameState } from "../../types/runtime.js";
import type { CtxDeps } from "../../ws/context.types.js";
import { parseFinalWagerImage } from "../../services/ai/judge/wagerImage.js";
import type { HostTtsCtx } from "../host/ttsBank.js";
import { shouldIncrementStats } from "../statsGate.js";
import { ensureFinalResponseStores, getFinalistUsernames, normalizeFinalWager } from "./helpers.js";
import { checkAllDrawingsSubmitted, checkAllWagersSubmitted } from "./phases.js";
import type { FinalJeopardyPhasesCtx } from "./phases.js";

export type FinalJeopardySubmissionsCtx = FinalJeopardyPhasesCtx &
  HostTtsCtx &
  CtxDeps<"judgeImage" | "ensureFinalJeopardyAnswer" | "ensureFinalJeopardyWager">;

export async function submitDrawing(
  game: GameState,
  gameId: string,
  player: string,
  drawing: string,
  ctx: FinalJeopardySubmissionsCtx,
) {
  const expected = getFinalistUsernames(game);
  if (!expected.includes(player)) return;

  ensureFinalResponseStores(game);
  game.drawings[player] = drawing;

  const { verdict, transcript } = await ctx.judgeImage(game.selectedClue?.answer, drawing);
  game.finalVerdicts[player] = verdict;
  game.finalTranscripts[player] = transcript;
  void ctx.ensureFinalJeopardyAnswer(ctx, game, gameId, player, transcript);

  checkAllDrawingsSubmitted(game, gameId, ctx);
}

export function submitWager(
  game: GameState,
  gameId: string,
  player: string,
  wager: number,
  ctx: FinalJeopardySubmissionsCtx,
) {
  const expected = getFinalistUsernames(game);
  if (!expected.includes(player)) return;

  const normalizedWager = normalizeFinalWager(game.scores?.[player], wager);

  if (shouldIncrementStats(game)) {
    ctx.fireAndForget(
      ctx.repos.profiles.incrementFinalJeopardyParticipations(player),
      "Increment final jeopardy Participation",
    );
  }

  if (!game.wagers) {
    game.wagers = {};
  }
  game.wagers[player] = normalizedWager;
  ctx.fireAndForget(
    ctx.ensureFinalJeopardyWager(ctx, game, gameId, player, Number(normalizedWager)),
    "Ensuring final jeopardy wager",
  );

  checkAllWagersSubmitted(game, gameId, ctx);
}

export async function submitWagerDrawing(
  game: GameState,
  gameId: string,
  player: string,
  drawing: string,
  ctx: FinalJeopardySubmissionsCtx,
) {
  if (game.finalJeopardyStage !== "wager") return;

  const expected = getFinalistUsernames(game);
  if (!expected.includes(player)) return;

  const maxWager = Math.max(0, Math.floor(Number(game.scores?.[player] ?? 0)));
  const parsed = await parseFinalWagerImage(drawing, maxWager);
  const normalizedWager = normalizeFinalWager(game.scores?.[player], parsed.wager);

  if (!game.wagers) game.wagers = {};
  game.wagers[player] = normalizedWager;
  if (!game.finalWagerDrawings) game.finalWagerDrawings = {};
  game.finalWagerDrawings[player] = drawing;

  if (shouldIncrementStats(game)) {
    ctx.fireAndForget(
      ctx.repos.profiles.incrementFinalJeopardyParticipations(player),
      "Increment final jeopardy Participation",
    );
  }
  ctx.fireAndForget(
    ctx.ensureFinalJeopardyWager(ctx, game, gameId, player, Number(normalizedWager)),
    "Ensuring final jeopardy wager",
  );

  checkAllWagersSubmitted(game, gameId, ctx);
}

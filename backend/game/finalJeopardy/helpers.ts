import type { GameState, PlayerState } from "../../types/runtime.js";
import type { CtxDeps } from "../../ws/context.types.js";
import { shouldIncrementStats } from "../statsGate.js";

export type FinalHelpersCtx = CtxDeps<"fireAndForget" | "repos">;

function getExpectedFinalists(game: GameState): PlayerState[] {
  const players = Array.isArray(game?.players) ? game.players : [];

  return players.filter((p: PlayerState) => {
    const score = Number(game.scores[p.username] ?? 0);
    const online = p?.online !== false;
    return score > 0 && online;
  });
}

export function getFinalistUsernames(game: GameState): string[] {
  if (Array.isArray(game?.finalJeopardyFinalists)) return game.finalJeopardyFinalists;
  const names = getExpectedFinalists(game).map((p: PlayerState) => p.username);
  game.finalJeopardyFinalists = names;
  return names;
}

export function normalizeFinalWager(score: unknown, wager: unknown): number {
  const maxWager = Math.max(0, Math.floor(Number(score ?? 0)));
  const normalized = Math.max(0, Math.abs(Math.trunc(Number(wager) || 0)));
  return Math.min(maxWager, normalized);
}

export function ensureFinalResponseStores(game: GameState) {
  if (!game.drawings) game.drawings = {};
  if (!game.finalVerdicts) game.finalVerdicts = {};
  if (!game.finalTranscripts) game.finalTranscripts = {};
}

export function applyFinalJeopardyScoring(game: GameState, finalists: string[], ctx: FinalHelpersCtx) {
  const verdicts = game.finalVerdicts || {};
  const wagers = game.wagers || {};
  const scores = game.scores || {};
  const finalistSet = new Set(finalists);
  const allowStats = shouldIncrementStats(game);

  for (const player of game.players || []) {
    const username = player.username;
    if (!finalistSet.has(username)) continue;

    const score = Number(scores[username] ?? 0);
    const wager = Number(wagers[username] ?? 0);

    if (verdicts[username] === "correct") {
      scores[username] = score + wager;
      if (allowStats) {
        ctx.fireAndForget(
          ctx.repos.profiles.incrementFinalJeopardyCorrects(username),
          "Increment FJ correct",
        );
      }
    } else {
      scores[username] = score - wager;
    }
  }
}

export function computeFinalTop(game: GameState, finalists: string[]) {
  return finalists
    .map((username: string) => {
      const player = (game.players || []).find((p: PlayerState) => p.username === username);
      return {
        username,
        displayname: player?.displayname ?? username,
        score: Number(game.scores?.[username] ?? 0),
      };
    })
    .sort((a: { score: number }, b: { score: number }) => b.score - a.score)
    .slice(0, 3);
}

export function buildPodiumPayoutScores(
  game: GameState,
  top: Array<{ username: string; score: number }>,
) {
  const finalScores = Object.fromEntries((game.players || []).map((p: PlayerState) => [p.username, 0]));

  // Jeopardy rule: winner keeps their actual final score, even if below 2nd-place payout.
  if (top[0]) finalScores[top[0].username] = top[0].score;
  if (top[1]) finalScores[top[1].username] = 3000;
  if (top[2]) finalScores[top[2].username] = 2000;

  return finalScores;
}

import type { GameState, PlayerState } from "../../types/runtime.js";

export function normUsername(u: unknown): string {
  return String(u ?? "")
    .trim()
    .toLowerCase();
}

export function findPlayerByUsername(game: GameState, username: string) {
  const u = normUsername(username);
  if (!u) return null;
  return (game?.players || []).find((p: PlayerState) => normUsername(p?.username) === u) || null;
}

export function displaynameFor(game: GameState, username: string) {
  const p = findPlayerByUsername(game, username);
  const d = String(p?.displayname ?? "").trim();
  return d || String(username ?? "").trim();
}

export function applyScore(game: GameState, username: string, delta: number) {
  const u = normUsername(username);
  if (!u) return;

  if (!game.scores) game.scores = {};
  game.scores[u] = (game.scores[u] || 0) + Number(delta || 0);
}

export function getDailyDoubleWagerIfActive(game: GameState): number | null {
  const dd = game?.dailyDouble;
  if (!dd) return null;

  const currentClueKey = game?.clueState?.clueKey || null;
  if (!currentClueKey) return null;

  if (dd.clueKey !== currentClueKey) return null;

  const w = Number(dd.wager);
  if (!Number.isFinite(w)) return null;

  return w;
}

export function parseClueValue(val: unknown): number {
  const n = Number(String(val || "").replace(/[^0-9]/g, ""));
  return Number.isFinite(n) ? n : 0;
}

export function getActiveClueWorth(game: GameState): number {
  const wager = getDailyDoubleWagerIfActive(game);
  if (wager !== null) return wager;
  return parseClueValue(game?.selectedClue?.value);
}

export function isDailyDoubleActiveForCurrentClue(game: GameState): boolean {
  return getDailyDoubleWagerIfActive(game) !== null;
}

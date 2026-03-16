import type { BoardData, Clue } from "../../../../shared/types/board.ts";

export function normalizeSocketUsername(value: unknown): string {
  return String(value ?? "")
    .trim()
    .toLowerCase();
}

export function createInitialBoardData(): BoardData {
  return {
    firstBoard: { categories: [{ category: "", values: [] }] },
    secondBoard: { categories: [{ category: "", values: [] }] },
    finalJeopardy: { categories: [{ category: "", values: [] }] },
  };
}

export function makeAiHostAssetPayload(args: {
  seq: number;
  assetId: string;
  startedAtMs?: number | null;
  offsetMs: number;
}): string {
  const startedAt = Number.isFinite(args.startedAtMs ?? NaN) ? Number(args.startedAtMs) : 0;
  const receivedAt = Date.now();
  return `${args.seq}::${args.assetId}::${startedAt}::${Math.max(0, Math.round(args.offsetMs))}::${receivedAt}`;
}

export function getSocketClueKey(clue?: Pick<Clue, "value" | "question"> | null): string | null {
  if (!clue) return null;
  const value = String(clue.value ?? "");
  const question = String(clue.question ?? "").trim();
  if (!question) return null;
  return `${value}:${question}`;
}

export function resolveScoreDelta(args: {
  player: string;
  delta: number;
  isFinalJeopardy: boolean;
  allWagersSubmitted: boolean;
  wagers: Record<string, number>;
}): number {
  const { player, delta, isFinalJeopardy, allWagersSubmitted, wagers } = args;
  if (!isFinalJeopardy || !allWagersSubmitted) return delta;

  const wager = Math.abs(wagers[player] ?? 0);
  return delta < 0 ? -wager : wager;
}

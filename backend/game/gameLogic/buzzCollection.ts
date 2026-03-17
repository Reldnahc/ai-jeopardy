import type { GameState } from "../../types/runtime.js";

export const EARLY_BUZZ_LOCKOUT_MS = 1000;
export const BUZZ_COLLECTION_MS = 50;
export const BUZZ_TIE_EPS_MS = 5;

export type PendingBuzzCandidate = NonNullable<GameState["pendingBuzz"]>["candidates"][number];

export function getEarlyBuzzLockoutUntil(now: number): number {
  return now + EARLY_BUZZ_LOCKOUT_MS;
}

export function getEstimatedBuzzAt(rawEstimate: unknown, now: number) {
  const numericEstimate = Number(rawEstimate);
  const usedClientEstimate =
    Number.isFinite(numericEstimate) && numericEstimate >= 1_000_000_000_000;

  return {
    estimatedAt: usedClientEstimate ? numericEstimate : now,
    usedClientEstimate,
  };
}

export function isEstimatedBuzzAtValid(
  game: GameState,
  estimatedAt: number,
  now: number,
  usedClientEstimate: boolean,
): boolean {
  if (!usedClientEstimate) {
    return true;
  }

  const openAt = Number(game.clueState?.buzzOpenAtMs || 0);
  const maxEarlyMs = 50;
  const maxFutureMs = 250;

  if (openAt > 0 && estimatedAt < openAt - maxEarlyMs) {
    return false;
  }

  if (estimatedAt > now + maxFutureMs) {
    return false;
  }

  return true;
}

export function createPendingBuzzState(now: number): NonNullable<GameState["pendingBuzz"]> {
  return {
    deadline: now + BUZZ_COLLECTION_MS,
    candidates: [],
    timer: null,
  };
}

export function addPendingBuzzCandidate(game: GameState, candidate: PendingBuzzCandidate): boolean {
  if (!game.pendingBuzz) {
    return false;
  }

  const alreadyQueued = game.pendingBuzz.candidates.some(
    (entry) => entry.playerUsername === candidate.playerUsername,
  );
  if (alreadyQueued) {
    return false;
  }

  game.pendingBuzz.candidates.push(candidate);
  return true;
}

export function resolvePendingBuzzWinner(
  candidates: PendingBuzzCandidate[],
): PendingBuzzCandidate | null {
  if (candidates.length === 0) {
    return null;
  }

  return [...candidates].sort((left, right) => {
    const estimatedDelta = left.est - right.est;
    if (Math.abs(estimatedDelta) <= BUZZ_TIE_EPS_MS) {
      const arrivalDelta = left.arrival - right.arrival;
      if (arrivalDelta !== 0) {
        return arrivalDelta;
      }

      return (left.msgSeq || 0) - (right.msgSeq || 0);
    }

    return estimatedDelta;
  })[0] || null;
}

import { describe, expect, it } from "vitest";
import type { GameState } from "../../types/runtime.js";
import {
  addPendingBuzzCandidate,
  createPendingBuzzState,
  getEstimatedBuzzAt,
  getEarlyBuzzLockoutUntil,
  isEstimatedBuzzAtValid,
  resolvePendingBuzzWinner,
} from "./buzzCollection.js";

function makeGame(overrides: Partial<GameState> = {}): GameState {
  return {
    players: [],
    clueState: { clueKey: "firstBoard:400:Q", lockedOut: {} },
    ...overrides,
  };
}

describe("buzzCollection", () => {
  it("derives early-buzz lockout from current time", () => {
    expect(getEarlyBuzzLockoutUntil(1000)).toBe(2000);
  });

  it("uses client estimate only for epoch millisecond payloads", () => {
    expect(getEstimatedBuzzAt(123, 1000)).toEqual({
      estimatedAt: 1000,
      usedClientEstimate: false,
    });
    expect(getEstimatedBuzzAt(1_700_000_000_000, 1000)).toEqual({
      estimatedAt: 1_700_000_000_000,
      usedClientEstimate: true,
    });
  });

  it("validates estimated buzz timestamps against open and future bounds", () => {
    const game = makeGame({ clueState: { clueKey: "k", lockedOut: {}, buzzOpenAtMs: 2000 } });

    expect(isEstimatedBuzzAtValid(game, 1949, 2100, true)).toBe(false);
    expect(isEstimatedBuzzAtValid(game, 2351, 2100, true)).toBe(false);
    expect(isEstimatedBuzzAtValid(game, 2001, 2100, true)).toBe(true);
  });

  it("adds only one pending candidate per player", () => {
    const game = makeGame({ pendingBuzz: createPendingBuzzState(1000) });

    expect(
      addPendingBuzzCandidate(game, {
        playerUsername: "alice",
        playerDisplayname: "Alice",
        est: 1000,
        arrival: 1000,
        clientSeq: 1,
        msgSeq: 1,
      }),
    ).toBe(true);
    expect(
      addPendingBuzzCandidate(game, {
        playerUsername: "alice",
        playerDisplayname: "Alice",
        est: 999,
        arrival: 999,
        clientSeq: 2,
        msgSeq: 2,
      }),
    ).toBe(false);
  });

  it("resolves ties by arrival order and then message sequence", () => {
    const winner = resolvePendingBuzzWinner([
      {
        playerUsername: "alice",
        playerDisplayname: "Alice",
        est: 1000,
        arrival: 1005,
        clientSeq: 1,
        msgSeq: 3,
      },
      {
        playerUsername: "bob",
        playerDisplayname: "Bob",
        est: 1002,
        arrival: 1005,
        clientSeq: 1,
        msgSeq: 2,
      },
      {
        playerUsername: "carol",
        playerDisplayname: "Carol",
        est: 1000,
        arrival: 1005,
        clientSeq: 1,
        msgSeq: 1,
      },
    ]);

    expect(winner?.playerUsername).toBe("carol");
  });
});

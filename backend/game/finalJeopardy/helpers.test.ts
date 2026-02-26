import { describe, expect, it, vi } from "vitest";
import type { GameState } from "../../types/runtime.js";
import {
  applyFinalJeopardyScoring,
  buildPodiumPayoutScores,
  computeFinalTop,
  ensureFinalResponseStores,
  getFinalistUsernames,
  normalizeFinalWager,
} from "./helpers.js";

function makeCtx() {
  return {
    fireAndForget: vi.fn(),
    repos: {
      profiles: {
        incrementFinalJeopardyCorrects: vi.fn(async () => {}),
      },
    },
  };
}

describe("finalJeopardy helpers", () => {
  it("computes and memoizes finalists from positive, online players", () => {
    const game = {
      players: [
        { username: "alice", online: true },
        { username: "bob", online: false },
        { username: "carol" },
      ],
      scores: { alice: 100, bob: 200, carol: 0 },
    } as unknown as GameState;

    expect(getFinalistUsernames(game as never)).toEqual(["alice"]);
    game.finalJeopardyFinalists = ["cached"];
    expect(getFinalistUsernames(game as never)).toEqual(["cached"]);
    expect(getFinalistUsernames({} as never)).toEqual([]);
  });

  it("normalizes final wager bounds", () => {
    expect(normalizeFinalWager(900, 1200)).toBe(900);
    expect(normalizeFinalWager(900, -250)).toBe(250);
    expect(normalizeFinalWager(-100, 50)).toBe(0);
  });

  it("ensures response stores only when missing", () => {
    const game = {} as Record<string, unknown>;
    ensureFinalResponseStores(game as never);
    expect(game.drawings).toEqual({});
    expect(game.finalVerdicts).toEqual({});
    expect(game.finalTranscripts).toEqual({});

    const drawings = game.drawings;
    ensureFinalResponseStores(game as never);
    expect(game.drawings).toBe(drawings);
  });

  it("applies final scoring and increments stats when allowed", () => {
    const ctx = makeCtx();
    const game = {
      players: [{ username: "alice" }, { username: "bob" }, { username: "carol" }],
      scores: { alice: 1000, bob: 1000, carol: 1000 },
      wagers: { alice: 400, bob: 300, carol: 200 },
      finalVerdicts: { alice: "correct", bob: "incorrect", carol: "correct" },
    };

    applyFinalJeopardyScoring(game as never, ["alice", "bob"], ctx as never);

    expect(game.scores).toEqual({ alice: 1400, bob: 700, carol: 1000 });
    expect(ctx.fireAndForget).toHaveBeenCalledTimes(1);
    expect(ctx.repos.profiles.incrementFinalJeopardyCorrects).toHaveBeenCalledWith("alice");
  });

  it("skips stats increment for imported-board games", () => {
    const ctx = makeCtx();
    const game = {
      isImportedBoardGame: true,
      players: [{ username: "alice" }],
      scores: { alice: 1000 },
      wagers: { alice: 400 },
      finalVerdicts: { alice: "correct" },
    };

    applyFinalJeopardyScoring(game as never, ["alice"], ctx as never);
    expect(game.scores.alice).toBe(1400);
    expect(ctx.fireAndForget).not.toHaveBeenCalled();
  });

  it("handles missing player/scores/wagers stores with defaults", () => {
    const ctx = makeCtx();
    const game = {
      players: undefined,
      scores: undefined,
      wagers: undefined,
      finalVerdicts: undefined,
    } as unknown as Record<string, unknown>;

    applyFinalJeopardyScoring(game as never, ["alice"], ctx as never);
    expect(ctx.fireAndForget).not.toHaveBeenCalled();

    expect(computeFinalTop(game as never, ["alice"])).toEqual([
      { username: "alice", displayname: "alice", score: 0 },
    ]);
    expect(buildPodiumPayoutScores(game as never, [{ username: "alice", score: 1234 }])).toEqual({
      alice: 1234,
    });
  });

  it("covers default score/wager paths and zero-valued normalization branches", () => {
    const ctx = makeCtx();
    const gameForFinalists = {
      players: [{ username: "alice", online: true }],
      scores: {},
    };
    expect(getFinalistUsernames(gameForFinalists as never)).toEqual([]);

    const gameForScoring = {
      players: [{ username: "alice" }],
      scores: {} as Record<string, number>,
      wagers: {} as Record<string, number>,
      finalVerdicts: { alice: "incorrect" },
    };
    applyFinalJeopardyScoring(gameForScoring as never, ["alice"], ctx as never);
    expect(gameForScoring.scores.alice).toBe(0);

    expect(normalizeFinalWager(undefined, undefined)).toBe(0);
    expect(normalizeFinalWager(10.9, "0")).toBe(0);
  });

  it("computes top 3 with displayname fallback and builds podium payouts", () => {
    const game = {
      players: [
        { username: "alice", displayname: "Alice" },
        { username: "bob" },
        { username: "carol", displayname: "Carol" },
      ],
      scores: { alice: 2000, bob: 2500, carol: 1500 },
    };

    const top = computeFinalTop(game as never, ["alice", "bob", "carol"]);
    expect(top).toEqual([
      { username: "bob", displayname: "bob", score: 2500 },
      { username: "alice", displayname: "Alice", score: 2000 },
      { username: "carol", displayname: "Carol", score: 1500 },
    ]);

    expect(buildPodiumPayoutScores(game as never, top)).toEqual({
      alice: 3000,
      bob: 2500,
      carol: 2000,
    });
    expect(buildPodiumPayoutScores(game as never, [])).toEqual({ alice: 0, bob: 0, carol: 0 });
  });
});

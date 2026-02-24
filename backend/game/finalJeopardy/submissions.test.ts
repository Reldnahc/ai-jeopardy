import { beforeEach, describe, expect, it, vi } from "vitest";
import type { GameState } from "../../types/runtime.js";
import { createCtx, fireAndForget } from "../../test/createCtx.js";
import { submitDrawing, submitWager, submitWagerDrawing } from "./submissions.js";

const checkAllWagersSubmitted = vi.fn();
const checkAllDrawingsSubmitted = vi.fn();
const parseFinalWagerImage = vi.fn(async () => ({
  wager: 9999,
  transcript: "9999",
  confidence: 0.9,
  reason: "ok",
}));

vi.mock("./phases.js", () => ({
  checkAllWagersSubmitted: (...args: unknown[]) => checkAllWagersSubmitted(...args),
  checkAllDrawingsSubmitted: (...args: unknown[]) => checkAllDrawingsSubmitted(...args),
}));

vi.mock("../../services/ai/judge/wagerImage.js", () => ({
  parseFinalWagerImage: (...args: unknown[]) => parseFinalWagerImage(...args),
}));

function buildGame(overrides: Partial<GameState> = {}): GameState {
  return {
    isFinalJeopardy: true,
    finalJeopardyStage: "wager",
    finalJeopardyFinalists: ["alice", "bob"],
    players: [
      { username: "alice", displayname: "Alice", online: true },
      { username: "bob", displayname: "Bob", online: true },
      { username: "carol", displayname: "Carol", online: true },
    ],
    scores: { alice: 2000, bob: 2500, carol: 1500 },
    selectedClue: { question: "Q", answer: "A" },
    ...overrides,
  };
}

function buildCtx(overrides: Record<string, unknown> = {}) {
  return createCtx(
    {
      repos: {
        profiles: {
          incrementFinalJeopardyParticipations: vi.fn(async () => {}),
        },
      },
      fireAndForget,
      judgeImage: vi.fn(async () => ({ verdict: "correct", transcript: "what is a" })),
      ensureFinalJeopardyAnswer: vi.fn(async () => {}),
      ensureFinalJeopardyWager: vi.fn(async () => {}),
      ...overrides,
    },
    overrides,
  );
}

describe("finalJeopardy submissions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("submitDrawing ignores non-finalist users", async () => {
    const game = buildGame();
    const ctx = buildCtx();

    await submitDrawing(game, "g1", "carol", "drawing", ctx);

    expect(game.drawings).toBeUndefined();
    expect(checkAllDrawingsSubmitted).not.toHaveBeenCalled();
  });

  it("submitDrawing stores drawing/judgement and checks completion", async () => {
    const game = buildGame();
    const ctx = buildCtx();

    await submitDrawing(game, "g1", "alice", "drawing", ctx);

    expect(game.drawings?.alice).toBe("drawing");
    expect(game.finalVerdicts?.alice).toBe("correct");
    expect(game.finalTranscripts?.alice).toBe("what is a");
    expect(ctx.ensureFinalJeopardyAnswer).toHaveBeenCalledWith(ctx, game, "g1", "alice", "what is a");
    expect(checkAllDrawingsSubmitted).toHaveBeenCalledWith(game, "g1", ctx);
  });

  it("submitWager normalizes wager and checks completion", () => {
    const game = buildGame();
    const ctx = buildCtx();

    submitWager(game, "g1", "bob", -99999, ctx);

    expect(game.wagers?.bob).toBe(2500);
    expect(ctx.repos.profiles.incrementFinalJeopardyParticipations).toHaveBeenCalledWith("bob");
    expect(ctx.ensureFinalJeopardyWager).toHaveBeenCalledWith(ctx, game, "g1", "bob", 2500);
    expect(checkAllWagersSubmitted).toHaveBeenCalledWith(game, "g1", ctx);
  });

  it("submitWager ignores non-finalist users", () => {
    const game = buildGame();
    const ctx = buildCtx();

    submitWager(game, "g1", "carol", 500, ctx);

    expect(game.wagers).toBeUndefined();
    expect(checkAllWagersSubmitted).not.toHaveBeenCalled();
  });

  it("submitWagerDrawing no-ops when not in wager stage", async () => {
    const game = buildGame({ finalJeopardyStage: "drawing" });
    const ctx = buildCtx();

    await submitWagerDrawing(game, "g1", "alice", "img", ctx);

    expect(parseFinalWagerImage).not.toHaveBeenCalled();
    expect(game.finalWagerDrawings).toBeUndefined();
  });

  it("submitWagerDrawing parses, normalizes, stores image and checks completion", async () => {
    const game = buildGame();
    const ctx = buildCtx();

    await submitWagerDrawing(game, "g1", "alice", "img", ctx);

    expect(parseFinalWagerImage).toHaveBeenCalledWith("img", 2000);
    expect(game.wagers?.alice).toBe(2000);
    expect(game.finalWagerDrawings?.alice).toBe("img");
    expect(ctx.ensureFinalJeopardyWager).toHaveBeenCalledWith(ctx, game, "g1", "alice", 2000);
    expect(checkAllWagersSubmitted).toHaveBeenCalledWith(game, "g1", ctx);
  });
});

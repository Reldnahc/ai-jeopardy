import { describe, expect, it, vi } from "vitest";
import type { GameState } from "../../types/runtime.js";
import type { Ctx } from "../../ws/context.types.js";
import {
  checkAllDrawingsSubmitted,
  checkAllWagersSubmitted,
  submitWager,
  submitWagerDrawing,
} from "./finalJeopardy.js";

vi.mock("../../services/ai/judge/wagerImage.js", () => ({
  parseFinalWagerImage: vi.fn(async () => ({
    wager: 0,
    transcript: "0",
    confidence: 1,
    reason: "ok",
  })),
}));

type ProfilesRepoFns = {
  incrementFinalJeopardyParticipations: ReturnType<typeof vi.fn>;
  incrementFinalJeopardyCorrects: ReturnType<typeof vi.fn>;
  incrementGamesWon: ReturnType<typeof vi.fn>;
  addMoneyWon: ReturnType<typeof vi.fn>;
  incrementGamesFinished: ReturnType<typeof vi.fn>;
  getIdByUsername: ReturnType<typeof vi.fn>;
};

function buildGame(overrides: Partial<GameState> = {}): GameState {
  return {
    isFinalJeopardy: true,
    finalJeopardyStage: "wager",
    players: [
      { username: "alice", displayname: "Alice", online: true },
      { username: "bob", displayname: "Bob", online: true },
      { username: "carol", displayname: "Carol", online: true },
      { username: "dave", displayname: "Dave", online: true },
    ],
    scores: { alice: 2000, bob: 2500, carol: 2200, dave: 0 },
    boardData: {
      finalJeopardy: {
        categories: [
          {
            category: "Science",
            values: [{ value: 0, question: "Final clue?", answer: "What is test?" }],
          },
        ],
      },
      ttsByClueKey: {},
    },
    clearedClues: new Set(),
    ...overrides,
  };
}

function buildCtx() {
  const profiles: ProfilesRepoFns = {
    incrementFinalJeopardyParticipations: vi.fn(async () => {}),
    incrementFinalJeopardyCorrects: vi.fn(async () => {}),
    incrementGamesWon: vi.fn(async () => {}),
    addMoneyWon: vi.fn(async () => {}),
    incrementGamesFinished: vi.fn(async () => {}),
    getIdByUsername: vi.fn(async (username: string) => username),
  };

  const ctx = {
    repos: { profiles },
    broadcast: vi.fn(),
    clearGameTimer: vi.fn(),
    startGameTimer: vi.fn(),
    aiHostVoiceSequence: vi.fn(
      async (_ctx: Ctx, _gameId: string, _game: GameState, steps: Array<{ after?: () => unknown }>) => {
        for (const step of steps) {
          if (typeof step?.after === "function") {
            await step.after();
          }
        }
        return true;
      },
    ),
    judgeImage: vi.fn(async () => ({ verdict: "incorrect", transcript: "" })),
    ensureFinalJeopardyAnswer: vi.fn(async () => {}),
    ensureFinalJeopardyWager: vi.fn(async () => {}),
    normalizeName: (name: unknown) => String(name ?? "").trim().toLowerCase(),
    fireAndForget: (p: PromiseLike<unknown>) => {
      void p;
    },
  } as unknown as Ctx;

  return { ctx, profiles };
}

async function flushAsyncWork() {
  await Promise.resolve();
  await Promise.resolve();
}

describe("finalJeopardy", () => {
  it("normalizes typed wager to abs value and clamps to max score", () => {
    const game = buildGame();
    const { ctx } = buildCtx();

    submitWager(game, "g1", "alice", -5000, ctx);

    expect(game.wagers?.alice).toBe(2000);
  });

  it("ignores submitWager for non-finalists", () => {
    const game = buildGame();
    const { ctx, profiles } = buildCtx();

    submitWager(game, "g1", "dave", 500, ctx);

    expect(game.wagers?.dave).toBeUndefined();
    expect(profiles.incrementFinalJeopardyParticipations).not.toHaveBeenCalled();
  });

  it("normalizes parsed wager drawing to abs value and clamps to max score", async () => {
    const game = buildGame();
    const { ctx } = buildCtx();

    const wagerImage = await import("../../services/ai/judge/wagerImage.js");
    vi.mocked(wagerImage.parseFinalWagerImage).mockResolvedValueOnce({
      wager: -99999,
      transcript: "-99999",
      confidence: 0.9,
      reason: "ok",
    });

    await submitWagerDrawing(game, "g1", "bob", "data:image/png;base64,abc", ctx);

    expect(game.wagers?.bob).toBe(2500);
    expect(game.finalWagerDrawings?.bob).toBe("data:image/png;base64,abc");
  });

  it("advances from wager to drawing when all finalists have submitted wagers", async () => {
    const game = buildGame({
      finalJeopardyStage: "wager",
      wagers: { alice: 100, bob: 100, carol: 100 },
      finalJeopardyFinalists: ["alice", "bob", "carol"],
    });
    const { ctx } = buildCtx();

    checkAllWagersSubmitted(game, "g1", ctx);
    await flushAsyncWork();

    expect(game.finalJeopardyStage).toBe("drawing");
    expect(game.phase).toBe("clue");
    expect(game.selectedClue?.question).toBe("Final clue?");
    expect(ctx.startGameTimer).toHaveBeenCalled();
  });

  it("keeps winner identity even when second-place payout is higher", async () => {
    const game = buildGame({
      finalJeopardyStage: "drawing",
      finalJeopardyFinalists: ["alice", "bob", "carol"],
      wagers: { alice: 500, bob: 100, carol: 400 },
      drawings: { alice: "a", bob: "b", carol: "c" },
      finalVerdicts: { alice: "correct", bob: "incorrect", carol: "incorrect" },
      finalTranscripts: { alice: "x", bob: "y", carol: "z" },
      selectedClue: { question: "Final clue?", answer: "What is test?", isAnswerRevealed: false },
      scores: { alice: 2000, bob: 2500, carol: 2200, dave: 0 },
    });
    const { ctx } = buildCtx();

    checkAllDrawingsSubmitted(game, "g1", ctx);
    await vi.waitFor(() => {
      expect(game.scores?.bob).toBe(3000);
    });

    expect(game.finalPlacements).toEqual(["alice", "bob", "carol"]);
    expect(game.scores).toMatchObject({
      alice: 2500,
      bob: 3000,
      carol: 2000,
      dave: 0,
    });

    expect(ctx.broadcast).toHaveBeenCalledWith("g1", {
      type: "final-score-screen",
      finalPlacements: ["alice", "bob", "carol"],
    });
  });
});

import { describe, expect, it, vi } from "vitest";
import type { GameState } from "../../types/runtime.js";
import type { Ctx } from "../../ws/context.types.js";
import {
  autoResolveAfterJudgement,
  cancelAutoUnlock,
  findCategoryForClue,
  parseClueValue,
} from "./gameLogic.js";

type ProfileFns = {
  incrementCorrectAnswers: ReturnType<typeof vi.fn>;
  incrementDailyDoubleCorrect: ReturnType<typeof vi.fn>;
  incrementWrongAnswers: ReturnType<typeof vi.fn>;
};

function buildCtx(overrides: Partial<Ctx> = {}) {
  const profiles: ProfileFns = {
    incrementCorrectAnswers: vi.fn(async () => {}),
    incrementDailyDoubleCorrect: vi.fn(async () => {}),
    incrementWrongAnswers: vi.fn(async () => {}),
  };

  const ctx = {
    repos: { profiles },
    broadcast: vi.fn(),
    fireAndForget: (p: PromiseLike<unknown>) => {
      void p;
    },
    aiHostVoiceSequence: vi.fn(async (_ctx: Ctx, _gameId: string, _game: GameState, steps: Array<{ after?: () => unknown }>) => {
      for (const step of steps) {
        if (typeof step?.after === "function") {
          await step.after();
        }
      }
      return true;
    }),
    sleep: vi.fn(async () => {}),
    clearAnswerWindow: vi.fn(),
    clearGameTimer: vi.fn(),
    checkBoardTransition: vi.fn(() => true),
    doUnlockBuzzerAuthoritative: vi.fn(),
    getClueKey: vi.fn(() => "firstBoard:400:Q"),
    startGameTimer: vi.fn(),
    sleepAndCheckGame: vi.fn(async () => true),
  } as unknown as Ctx;

  return { ctx: { ...ctx, ...overrides } as Ctx, profiles };
}

describe("gameLogic", () => {
  it("parseClueValue strips non-digits", () => {
    expect(parseClueValue("$1,200")).toBe(1200);
    expect(parseClueValue("abc")).toBe(0);
  });

  it("findCategoryForClue matches by value and question", () => {
    const game = {
      activeBoard: "firstBoard",
      boardData: {
        firstBoard: {
          categories: [
            {
              category: "Science",
              values: [{ value: 400, question: "What is H2O?" }],
            },
          ],
        },
      },
    } as unknown as GameState;

    const category = findCategoryForClue(game, { value: 400, question: "What is H2O?" });
    expect(category).toBe("Science");
  });

  it("cancelAutoUnlock clears timer and key", () => {
    const timer = setTimeout(() => {}, 1000);
    const game = { autoUnlockTimer: timer, autoUnlockClueKey: "k1" } as unknown as GameState;

    cancelAutoUnlock(game);

    expect(game.autoUnlockTimer).toBeNull();
    expect(game.autoUnlockClueKey).toBeNull();
  });

  it("autoResolveAfterJudgement correct updates score, reveals answer, and returns to board", async () => {
    const game = {
      players: [{ username: "alice", displayname: "Alice" }],
      scores: { alice: 0 },
      selectedClue: { value: "$400", question: "Q", answer: "A", isAnswerRevealed: false },
      phase: "clue",
      clueState: { clueKey: "firstBoard:400:Q", lockedOut: {} },
      clearedClues: new Set<string>(),
    } as unknown as GameState;

    const { ctx, profiles } = buildCtx();

    await autoResolveAfterJudgement(ctx, "g1", game, "alice", "correct");

    expect(game.scores?.alice).toBe(400);
    expect(game.selectorKey).toBe("alice");
    expect(game.selectorName).toBe("Alice");
    expect(game.phase).toBe("board");
    expect(game.selectedClue).toBeNull();
    expect(profiles.incrementCorrectAnswers).toHaveBeenCalledWith("alice");
  });

  it("autoResolveAfterJudgement incorrect on active DD subtracts wager and clears dailyDouble", async () => {
    const game = {
      players: [{ username: "alice", displayname: "Alice" }],
      scores: { alice: 1500 },
      selectedClue: { value: "$400", question: "Q", answer: "A", isAnswerRevealed: false },
      boardData: { ttsByAnswerKey: { "firstBoard:400:Q": "ans-asset" } },
      clueState: { clueKey: "firstBoard:400:Q", lockedOut: {} },
      clearedClues: new Set<string>(),
      dailyDouble: { clueKey: "firstBoard:400:Q", wager: 800, playerUsername: "alice" },
    } as unknown as GameState;

    const { ctx, profiles } = buildCtx();

    await autoResolveAfterJudgement(ctx, "g1", game, "alice", "incorrect");

    expect(game.scores?.alice).toBe(700);
    expect(game.dailyDouble).toBeNull();
    expect(game.phase).toBe("board");
    expect(profiles.incrementWrongAnswers).toHaveBeenCalledWith("alice");
  });
});

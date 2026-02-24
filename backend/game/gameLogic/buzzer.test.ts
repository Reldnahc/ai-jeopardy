import { describe, expect, it, vi } from "vitest";
import type { GameState } from "../../types/runtime.js";
import type { Ctx } from "../../ws/context.types.js";
import { cancelAutoUnlock, doUnlockBuzzerAuthoritative } from "./buzzer.js";
import { finishClueAndReturnToBoard } from "./boardFlow.js";

vi.mock("./boardFlow.js", () => ({
  finishClueAndReturnToBoard: vi.fn(),
}));

function makeCtx(overrides: Partial<Ctx> = {}) {
  const profiles = {
    incrementCluesSkipped: vi.fn(async () => {}),
  };

  const ctx = {
    repos: { profiles },
    clearGameTimer: vi.fn(),
    broadcast: vi.fn(),
    startGameTimer: vi.fn(),
    aiHostVoiceSequence: vi.fn(
      async (_ctx: Ctx, _gameId: string, _game: GameState, steps: Array<{ after?: () => unknown }>) => {
        for (const step of steps) {
          if (typeof step.after === "function") {
            await step.after();
          }
        }
        return true;
      },
    ),
    getClueKey: vi.fn(() => "firstBoard:400:Q"),
    sleepAndCheckGame: vi.fn(async () => true),
    fireAndForget: (p: PromiseLike<unknown>) => {
      void p;
    },
  } as unknown as Ctx;

  return { ctx: { ...ctx, ...overrides } as Ctx, profiles };
}

describe("buzzer", () => {
  it("cancelAutoUnlock clears clue key even when timer is missing", () => {
    const game = { autoUnlockTimer: null, autoUnlockClueKey: "k1" } as unknown as GameState;

    cancelAutoUnlock(game);

    expect(game.autoUnlockTimer).toBeNull();
    expect(game.autoUnlockClueKey).toBeNull();
  });

  it("doUnlockBuzzerAuthoritative exits safely when game is missing", () => {
    const { ctx } = makeCtx();

    doUnlockBuzzerAuthoritative("g1", null as unknown as GameState, ctx);

    expect(ctx.clearGameTimer).not.toHaveBeenCalled();
    expect(ctx.broadcast).not.toHaveBeenCalled();
  });

  it("unlocks buzzer and skips buzz timer when timeToBuzz is -1", () => {
    const pendingTimer = setTimeout(() => {}, 1000);
    const game = {
      clueState: {},
      pendingBuzz: { timer: pendingTimer },
      timeToBuzz: -1,
      buzzerLocked: true,
      buzzed: "alice",
    } as unknown as GameState;
    const { ctx } = makeCtx();

    doUnlockBuzzerAuthoritative("g1", game, ctx);

    expect(ctx.clearGameTimer).toHaveBeenCalledWith(game, "g1", ctx);
    expect(game.buzzerLocked).toBe(false);
    expect(game.buzzed).toBeNull();
    expect(game.pendingBuzz).toBeNull();
    expect(game.clueState?.buzzOpenAtMs).toBeTypeOf("number");
    expect(ctx.broadcast).toHaveBeenCalledWith("g1", { type: "buzzer-unlocked" });
    expect(ctx.startGameTimer).not.toHaveBeenCalled();
  });

  it("locks and resolves clue when buzz timer expires with no buzz", async () => {
    const game = {
      selectedClue: { question: "Q", answer: "A", isAnswerRevealed: false },
      clueState: { lockedOut: { bob: true } },
      players: [{ username: "alice" }, { username: "bob" }],
      boardData: { ttsByAnswerKey: { "firstBoard:400:Q": "asset-1" } },
      timeToBuzz: 3,
      buzzerLocked: false,
      buzzed: null,
    } as unknown as GameState;
    const { ctx, profiles } = makeCtx();

    doUnlockBuzzerAuthoritative("g1", game, ctx);
    const onExpire = vi.mocked(ctx.startGameTimer).mock.calls[0]?.[5] as
      | ((args: { gameId: string; game: GameState }) => void)
      | undefined;

    expect(onExpire).toBeTypeOf("function");
    onExpire?.({ gameId: "g1", game });
    await vi.waitFor(() => {
      expect(finishClueAndReturnToBoard).toHaveBeenCalledWith(ctx, "g1", game);
    });

    expect(game.buzzerLocked).toBe(true);
    expect(game.selectedClue?.isAnswerRevealed).toBe(true);
    expect(ctx.broadcast).toHaveBeenCalledWith("g1", { type: "buzzer-locked" });
    expect(ctx.broadcast).toHaveBeenCalledWith("g1", {
      type: "answer-revealed",
      clue: game.selectedClue,
    });
    expect(profiles.incrementCluesSkipped).toHaveBeenCalledTimes(1);
    expect(profiles.incrementCluesSkipped).toHaveBeenCalledWith("alice");
  });
});

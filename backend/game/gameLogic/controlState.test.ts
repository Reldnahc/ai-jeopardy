import { describe, expect, it } from "vitest";
import type { GameState } from "../../types/runtime.js";
import {
  applyManualScoreUpdate,
  lockBuzzer,
  markActiveBoardCluesComplete,
  resetAnswerCaptureState,
  resetBuzzerState,
  revealSelectedAnswer,
  setDailyDoubleSnipeNext,
  setSkipNextClue,
} from "./controlState.js";

describe("controlState helpers", () => {
  it("sets one-shot control flags", () => {
    const game = {} as GameState;

    expect(setSkipNextClue(game)).toBe(true);
    expect(game.skipNextClue).toBe(true);
    expect(setDailyDoubleSnipeNext(game, true)).toBe(true);
    expect(game.ddSnipeNext).toBe(true);
    expect(setDailyDoubleSnipeNext(game, false)).toBe(false);
  });

  it("locks and resets buzzer state", () => {
    const game = {
      buzzed: "alice",
      buzzerLocked: false,
      buzzLockouts: { alice: Date.now() + 1000 },
      timerEndTime: Date.now() + 5000,
      timerVersion: 2,
    } as unknown as GameState;

    expect(lockBuzzer(game)).toBe(true);
    expect(game.buzzerLocked).toBe(true);
    expect(resetBuzzerState(game)).toBe(3);
    expect(game.buzzed).toBeNull();
    expect(game.buzzLockouts).toEqual({});
    expect(game.timerEndTime).toBeNull();
  });

  it("marks active board clues complete", () => {
    const game = {
      activeBoard: "firstBoard",
      boardData: {
        firstBoard: {
          categories: [
            {
              values: [
                { value: 200, question: "Q1" },
                { value: 400, question: "Q2" },
              ],
            },
          ],
        },
      },
      clearedClues: new Set<string>(),
    } as unknown as GameState;

    expect(markActiveBoardCluesComplete(game)).toEqual(["200-Q1", "400-Q2"]);
    expect(game.clearedClues?.has("200-Q1")).toBe(true);
    expect(game.clearedClues?.has("400-Q2")).toBe(true);
  });

  it("reveals selected answer and resets answer capture state", () => {
    const game = {
      phase: "ANSWER_CAPTURE",
      answeringPlayerKey: "alice",
      answeringPlayerUsername: "alice",
      answerSessionId: "sess-1",
      answerClueKey: "firstBoard:200:Q1",
      selectedClue: { value: 200, question: "Q1", answer: "A1", isAnswerRevealed: false },
    } as unknown as GameState;

    expect(revealSelectedAnswer(game)).toBe(true);
    expect(game.selectedClue?.isAnswerRevealed).toBe(true);

    resetAnswerCaptureState(game);
    expect(game.phase).toBeNull();
    expect(game.answeringPlayerKey).toBeNull();
    expect(game.answeringPlayerUsername).toBeNull();
    expect(game.answerSessionId).toBeNull();
    expect(game.answerClueKey).toBeNull();
  });

  it("applies manual score updates through shared scoring logic", () => {
    const game = { scores: { alice: 1000 } } as unknown as GameState;
    applyManualScoreUpdate(game, "alice", 200);
    expect(game.scores?.alice).toBe(1200);
  });
});

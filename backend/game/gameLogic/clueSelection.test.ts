import { describe, expect, it } from "vitest";
import type { GameState } from "../../types/runtime.js";
import {
  activateLiveClue,
  applySelectedClue,
  buildClueKey,
  consumeDdSnipe,
  consumeSkippedClue,
  estimateClueSpeechMaxMs,
  normalizeGameValue,
  resolveSpecialClueModes,
  startDailyDoubleState,
} from "./clueSelection.js";

describe("clueSelection helpers", () => {
  it("normalizes selector comparison values", () => {
    expect(normalizeGameValue(" Alice ")).toBe("alice");
    expect(normalizeGameValue(null)).toBe("");
  });

  it("applies selected clue state and falls back to category lookup", () => {
    const game = {
      activeBoard: "firstBoard",
    } as GameState;

    const result = applySelectedClue({
      game,
      clue: { value: 400, question: "Q", category: "" },
      findCategoryForClue: () => "Science",
    });

    expect(result).toEqual({
      boardKey: "firstBoard",
      clueKey: "firstBoard:400:Q",
      clueQuestion: "Q",
    });
    expect(game.selectedClue).toMatchObject({
      value: 400,
      question: "Q",
      category: "Science",
      isAnswerRevealed: false,
    });
  });

  it("builds clue keys and resolves DD and skip modes", () => {
    const game = {
      boardData: {
        dailyDoubleClueKeys: { firstBoard: ["firstBoard:400:Q"] },
      },
      usedDailyDoubles: new Set<string>(),
      ddSnipeNext: true,
      skipNextClue: true,
    } as GameState;

    expect(buildClueKey("firstBoard", { value: 400, question: "Q" })).toBe("firstBoard:400:Q");
    expect(resolveSpecialClueModes(game, "firstBoard", "firstBoard:400:Q")).toEqual({
      naturalDailyDouble: true,
      snipedDailyDouble: true,
      isDailyDouble: true,
      shouldSkip: true,
    });
  });

  it("consumes dd snipe and skipped clue state", () => {
    const game = {
      ddSnipeNext: true,
      skipNextClue: true,
      clearedClues: new Set<string>(),
    } as GameState;

    consumeDdSnipe(game);
    const clueId = consumeSkippedClue(game, { value: 400, question: "Q" });

    expect(game.ddSnipeNext).toBe(false);
    expect(clueId).toBe("400-Q");
    expect(game.clearedClues?.has("400-Q")).toBe(true);
    expect(game.phase).toBe("board");
  });

  it("activates live clue and daily double state", () => {
    const game = {} as GameState;

    activateLiveClue(game, "firstBoard:400:Q");
    startDailyDoubleState({
      game,
      clueKey: "firstBoard:400:Q",
      boardKey: "firstBoard",
      playerUsername: "alice",
      playerDisplayname: "Alice",
      maxWager: 1200,
    });

    expect(game.phase).toBe("clue");
    expect(game.clueState).toEqual({ clueKey: "firstBoard:400:Q", lockedOut: {} });
    expect(game.dailyDouble).toMatchObject({
      clueKey: "firstBoard:400:Q",
      playerUsername: "alice",
      stage: "wager_listen",
      maxWager: 1200,
    });
  });

  it("caps clue speech estimate to the expected range", () => {
    expect(estimateClueSpeechMaxMs("")).toBe(2000);
    expect(estimateClueSpeechMaxMs("one two three")).toBe(2000);
    expect(estimateClueSpeechMaxMs(new Array(100).fill("word").join(" "))).toBe(14000);
  });
});

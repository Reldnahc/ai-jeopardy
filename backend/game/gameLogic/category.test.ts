import { describe, expect, it } from "vitest";
import type { GameState } from "../../types/runtime.js";
import { findCategoryForClue } from "./category.js";

describe("gameLogic category", () => {
  it("returns null when board categories are missing", () => {
    const game = { boardData: { firstBoard: {} } } as unknown as GameState;
    expect(findCategoryForClue(game, { value: 200, question: "Q1" })).toBeNull();
  });

  it("returns null when clue question is blank", () => {
    const game = {
      boardData: {
        firstBoard: {
          categories: [{ category: "Science", values: [{ value: 200, question: "Q1" }] }],
        },
      },
    } as unknown as GameState;
    expect(findCategoryForClue(game, { value: 200, question: "   " })).toBeNull();
  });

  it("matches by value and question on active board", () => {
    const game = {
      activeBoard: "secondBoard",
      boardData: {
        secondBoard: {
          categories: [{ category: "Astronomy", values: [{ value: 400, question: "This is Mars" }] }],
        },
      },
    } as unknown as GameState;

    expect(findCategoryForClue(game, { value: 400, question: "This is Mars" })).toBe("Astronomy");
  });

  it("returns null when question does not match even with same value", () => {
    const game = {
      boardData: {
        firstBoard: {
          categories: [{ category: "Science", values: [{ value: 200, question: "This is Venus" }] }],
        },
      },
    } as unknown as GameState;

    expect(findCategoryForClue(game, { value: 200, question: "This is Mars" })).toBeNull();
  });

  it("returns null when matched category name is empty", () => {
    const game = {
      boardData: {
        firstBoard: {
          categories: [{ category: "   ", values: [{ value: 200, question: "Q1" }] }],
        },
      },
    } as unknown as GameState;

    expect(findCategoryForClue(game, { value: 200, question: "Q1" })).toBeNull();
  });
});

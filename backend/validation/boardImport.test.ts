import { describe, expect, it } from "vitest";
import {
  normalizeCategories11,
  parseBoardJson,
  validateImportedBoardData,
} from "./boardImport.js";

function validBoard() {
  const makeClue = () => ({ value: 200, question: "Q", answer: "A" });
  const makeCategory = () => ({
    category: "Cat",
    values: [makeClue(), makeClue(), makeClue(), makeClue(), makeClue()],
  });
  return {
    firstBoard: {
      categories: [makeCategory(), makeCategory(), makeCategory(), makeCategory(), makeCategory()],
    },
    secondBoard: {
      categories: [makeCategory(), makeCategory(), makeCategory(), makeCategory(), makeCategory()],
    },
    finalJeopardy: {
      categories: { category: "Final", values: [{ value: 0, question: "FQ", answer: "FA" }] },
    },
  };
}

describe("boardImport", () => {
  it("normalizeCategories11 pads/truncates and stringifies", () => {
    expect(normalizeCategories11(["a", "b"]).length).toBe(11);
    expect(normalizeCategories11(Array(20).fill("x")).length).toBe(11);
    expect(normalizeCategories11([1, null])[0]).toBe("1");
  });

  it("parseBoardJson handles raw json and boardData wrapper", () => {
    const board = validBoard();
    expect(parseBoardJson(JSON.stringify(board))).toEqual(board);
    expect(parseBoardJson({ boardData: board })).toEqual(board);
    expect(parseBoardJson(board)).toEqual(board);
  });

  it("validateImportedBoardData accepts a valid board", () => {
    expect(validateImportedBoardData(validBoard())).toEqual({ ok: true });
  });

  it("rejects malformed top-level board shapes", () => {
    expect(validateImportedBoardData(null)).toEqual({
      ok: false,
      error: "Board JSON must be an object.",
    });
    expect(validateImportedBoardData({})).toEqual({
      ok: false,
      error: "Missing firstBoard, secondBoard, or finalJeopardy.",
    });
    expect(validateImportedBoardData({ ...validBoard(), firstBoard: { categories: [] } })).toEqual({
      ok: false,
      error: "firstBoard.categories must be an array of length 5.",
    });
  });

  it("rejects invalid category and clue field shapes", () => {
    const board = validBoard();
    board.firstBoard.categories[0] = { category: "", values: [] } as never;
    expect(validateImportedBoardData(board).ok).toBe(false);

    const board2 = validBoard();
    (board2.secondBoard.categories[0].values[0] as { value: unknown }).value = "200";
    expect(validateImportedBoardData(board2)).toEqual({
      ok: false,
      error: "secondBoard.categories[0].values[0].value must be a number.",
    });
  });

  it("rejects invalid final jeopardy categories variants", () => {
    const emptyFinalArray = { ...validBoard(), finalJeopardy: { categories: [] } };
    expect(validateImportedBoardData(emptyFinalArray)).toEqual({
      ok: false,
      error: "finalJeopardy.categories must have at least 1 category.",
    });

    const badFinal = {
      ...validBoard(),
      finalJeopardy: { categories: { category: "Final", values: [] } },
    };
    expect(validateImportedBoardData(badFinal)).toEqual({
      ok: false,
      error: "finalJeopardy.categories.values must be an array with at least 1 clue.",
    });

    const noAnswer = {
      ...validBoard(),
      finalJeopardy: {
        categories: { category: "Final", values: [{ value: 0, question: "FQ", answer: "" }] },
      },
    };
    expect(validateImportedBoardData(noAnswer)).toEqual({
      ok: false,
      error: "finalJeopardy.categories.values[0].answer must be a non-empty string.",
    });
  });
});

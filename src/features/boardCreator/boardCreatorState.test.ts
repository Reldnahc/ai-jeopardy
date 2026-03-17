import { describe, expect, it } from "vitest";
import { makeTemplateBoard } from "./boardCreatorUtils.ts";
import {
  getBoardValidationStatus,
  loadBoardFromJsonInput,
  updateBoardCategory,
  updateBoardClueField,
} from "./boardCreatorState.ts";

describe("boardCreatorState", () => {
  it("updates round category names without mutating the original board", () => {
    const board = makeTemplateBoard();
    const updated = updateBoardCategory(board, "firstBoard", 0, "History");

    expect(updated.firstBoard.categories[0].category).toBe("History");
    expect(board.firstBoard.categories[0].category).not.toBe("History");
  });

  it("updates clue fields without mutating the original board", () => {
    const board = makeTemplateBoard();
    const updated = updateBoardClueField(board, "secondBoard", 1, 2, "question", "New question");

    expect(updated.secondBoard.categories[1].values[2].question).toBe("New question");
    expect(board.secondBoard.categories[1].values[2].question).not.toBe("New question");
  });

  it("returns validation success for a valid board", () => {
    expect(getBoardValidationStatus(makeTemplateBoard())).toEqual({
      isError: false,
      message: "Board JSON looks valid for import.",
    });
  });

  it("loads and validates json before returning it", () => {
    const board = makeTemplateBoard();
    const result = loadBoardFromJsonInput(JSON.stringify(board));

    expect(result).toEqual({
      ok: true,
      board,
      status: { isError: false, message: "Loaded board JSON into editor." },
    });
  });

  it("returns parse and validation errors as status messages", () => {
    expect(loadBoardFromJsonInput("{")).toEqual({
      ok: false,
      status: { isError: true, message: "Invalid JSON." },
    });

    const invalidBoard = makeTemplateBoard();
    invalidBoard.firstBoard.categories[0].values[0].answer = " ";

    expect(loadBoardFromJsonInput(JSON.stringify(invalidBoard))).toEqual({
      ok: false,
      status: {
        isError: true,
        message: "firstBoard.categories[0].values[0].answer is required.",
      },
    });
  });
});

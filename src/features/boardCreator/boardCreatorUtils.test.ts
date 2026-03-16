import { describe, expect, it } from "vitest";
import {
  boardToPrettyJson,
  cloneBoard,
  makeTemplateBoard,
  parseBoardFromJson,
  validateBoard,
} from "./boardCreatorUtils.ts";

describe("boardCreatorUtils", () => {
  it("creates a valid starter template", () => {
    const board = makeTemplateBoard();

    expect(board.firstBoard.categories).toHaveLength(5);
    expect(board.secondBoard.categories).toHaveLength(5);
    expect(board.finalJeopardy.categories).toHaveLength(1);
    expect(validateBoard(board)).toEqual({ ok: true });
  });

  it("cloneBoard returns a deep copy", () => {
    const original = makeTemplateBoard();
    const cloned = cloneBoard(original);

    cloned.firstBoard.categories[0].category = "Changed";
    cloned.firstBoard.categories[0].values[0].question = "Different";

    expect(original.firstBoard.categories[0].category).not.toBe("Changed");
    expect(original.firstBoard.categories[0].values[0].question).not.toBe("Different");
  });

  it("parses and pretty-prints board JSON", () => {
    const board = makeTemplateBoard();
    const pretty = boardToPrettyJson(board);
    const parsed = parseBoardFromJson(pretty);

    expect(parsed).toEqual({ ok: true, board });
  });

  it("rejects invalid board JSON payloads", () => {
    expect(parseBoardFromJson("{")).toEqual({ ok: false, error: "Invalid JSON." });
    expect(parseBoardFromJson(JSON.stringify({ firstBoard: {} }))).toEqual({
      ok: false,
      error: "Missing firstBoard, secondBoard, or finalJeopardy.",
    });
  });

  it("validates required clue fields", () => {
    const board = makeTemplateBoard();
    board.firstBoard.categories[0].values[0].question = " ";

    expect(validateBoard(board)).toEqual({
      ok: false,
      error: "firstBoard.categories[0].values[0].question is required.",
    });
  });
});

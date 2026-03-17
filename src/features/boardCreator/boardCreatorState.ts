import type { BoardData } from "../../../shared/types/board.ts";
import { cloneBoard, parseBoardFromJson, validateBoard } from "./boardCreatorUtils.ts";

export type BoardRoundKey = "firstBoard" | "secondBoard" | "finalJeopardy";
export type EditableClueField = "value" | "question" | "answer";

export type BoardCreatorStatus = {
  isError: boolean;
  message: string;
};

export function updateBoardCategory(
  board: BoardData,
  round: BoardRoundKey,
  categoryIndex: number,
  nextName: string,
): BoardData {
  const nextBoard = cloneBoard(board);
  nextBoard[round].categories[categoryIndex].category = nextName;
  return nextBoard;
}

export function updateBoardClueField(
  board: BoardData,
  round: BoardRoundKey,
  categoryIndex: number,
  clueIndex: number,
  field: EditableClueField,
  value: string,
): BoardData {
  const nextBoard = cloneBoard(board);
  const clue = nextBoard[round].categories[categoryIndex].values[clueIndex];

  if (field === "value") clue.value = Number(value);
  if (field === "question") clue.question = value;
  if (field === "answer") clue.answer = value;

  return nextBoard;
}

export function getBoardValidationStatus(board: BoardData): BoardCreatorStatus {
  const result = validateBoard(board);
  if (!result.ok) {
    return { isError: true, message: result.error };
  }

  return { isError: false, message: "Board JSON looks valid for import." };
}

export function loadBoardFromJsonInput(
  raw: string,
): { ok: true; board: BoardData; status: BoardCreatorStatus } | { ok: false; status: BoardCreatorStatus } {
  const parsed = parseBoardFromJson(raw);
  if (!parsed.ok) {
    return { ok: false, status: { isError: true, message: parsed.error } };
  }

  const validation = validateBoard(parsed.board);
  if (!validation.ok) {
    return { ok: false, status: { isError: true, message: validation.error } };
  }

  return {
    ok: true,
    board: parsed.board,
    status: { isError: false, message: "Loaded board JSON into editor." },
  };
}

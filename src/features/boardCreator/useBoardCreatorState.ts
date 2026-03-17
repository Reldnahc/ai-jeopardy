import { useMemo, useState } from "react";
import type { BoardData } from "../../../shared/types/board.ts";
import { boardToPrettyJson, makeTemplateBoard } from "./boardCreatorUtils.ts";
import {
  getBoardValidationStatus,
  loadBoardFromJsonInput,
  updateBoardCategory,
  updateBoardClueField,
  type BoardCreatorStatus,
  type BoardRoundKey,
  type EditableClueField,
} from "./boardCreatorState.ts";

type StatusState = {
  message: string | null;
  isError: boolean;
};

function makeSuccessStatus(message: string): StatusState {
  return { message, isError: false };
}

function toStatusState(status: BoardCreatorStatus): StatusState {
  return { message: status.message, isError: status.isError };
}

export function useBoardCreatorState() {
  const [board, setBoard] = useState<BoardData>(() => makeTemplateBoard());
  const [jsonInput, setJsonInput] = useState("");
  const [status, setStatus] = useState<StatusState>({ message: null, isError: false });

  const outputJson = useMemo(() => boardToPrettyJson(board), [board]);

  const setRoundCategory = (round: BoardRoundKey, categoryIndex: number, nextName: string) => {
    setBoard((prev) => updateBoardCategory(prev, round, categoryIndex, nextName));
  };

  const setClueField = (
    round: BoardRoundKey,
    categoryIndex: number,
    clueIndex: number,
    field: EditableClueField,
    value: string,
  ) => {
    setBoard((prev) => updateBoardClueField(prev, round, categoryIndex, clueIndex, field, value));
  };

  const runValidation = () => {
    setStatus(toStatusState(getBoardValidationStatus(board)));
  };

  const loadFromJson = () => {
    const result = loadBoardFromJsonInput(jsonInput);
    setStatus(toStatusState(result.status));
    if (result.ok) {
      setBoard(result.board);
    }
  };

  const resetTemplate = () => {
    setBoard(makeTemplateBoard());
    setStatus(makeSuccessStatus("Reset to starter template."));
  };

  const copyJson = async () => {
    try {
      await navigator.clipboard.writeText(outputJson);
      setStatus(makeSuccessStatus("Copied board JSON."));
    } catch {
      setStatus({ message: "Could not copy to clipboard.", isError: true });
    }
  };

  const downloadJson = () => {
    const blob = new Blob([outputJson], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "board.json";
    anchor.click();
    URL.revokeObjectURL(url);
    setStatus(makeSuccessStatus("Downloaded board.json"));
  };

  return {
    board,
    jsonInput,
    setJsonInput,
    status,
    outputJson,
    setRoundCategory,
    setClueField,
    runValidation,
    loadFromJson,
    resetTemplate,
    copyJson,
    downloadJson,
  };
}

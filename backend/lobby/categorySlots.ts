import type { LobbyBoardType } from "../../shared/types/lobby.js";
import type { GameState } from "../types/runtime.js";

export function isLobbyBoardType(value: unknown): value is LobbyBoardType {
  return value === "firstBoard" || value === "secondBoard" || value === "finalJeopardy";
}

export function parseLobbyBoardIndex(index: unknown): number | null {
  const parsedIndex = Number(index);
  if (!Number.isFinite(parsedIndex)) return null;
  return parsedIndex;
}

export function isLobbyBoardIndexInRange(boardType: LobbyBoardType, index: number): boolean {
  if (boardType === "finalJeopardy") return index === 0;
  return index >= 0 && index <= 4;
}

export function toGlobalLobbyCategoryIndex(boardType: LobbyBoardType, index: number): number {
  if (boardType === "firstBoard") return index;
  if (boardType === "secondBoard") return 5 + index;
  return 10;
}

export function isLockedLobbyCategory(
  lockedCategories: GameState["lockedCategories"] | undefined | null,
  boardType: LobbyBoardType,
  index: number,
): boolean {
  if (!lockedCategories) return false;
  if (boardType === "finalJeopardy") return Boolean(lockedCategories.finalJeopardy?.[0]);
  return Boolean(lockedCategories[boardType]?.[index]);
}

import { useCallback } from "react";

type LobbySettingsLike = { boardJson?: string | null } | null | undefined;

export function useLobbyBoardJson(lobbySettings: LobbySettingsLike) {
  const boardJson = lobbySettings?.boardJson ?? "";
  const usingImportedBoard = Boolean(boardJson.trim());

  const tryValidateBoardJson = useCallback((raw: string): string | null => {
    if (!raw.trim()) return null; // empty means "use AI"

    try {
      const parsed = JSON.parse(raw) as unknown;

      // We only do minimal checks here because server is authoritative.
      if (typeof parsed !== "object" || parsed === null) return "Board JSON must be an object.";

      const p = parsed as Record<string, unknown>;
      const boardDataCandidate = p.boardData;
      const bd =
        boardDataCandidate && typeof boardDataCandidate === "object"
          ? (boardDataCandidate as Record<string, unknown>)
          : p;

      if (!bd.firstBoard || !bd.secondBoard || !bd.finalJeopardy) {
        return "Missing firstBoard / secondBoard / finalJeopardy.";
      }

      return null;
    } catch {
      return "Invalid JSON (can't parse).";
    }
  }, []);

  return { boardJson, usingImportedBoard, tryValidateBoardJson };
}

import { useCallback, useRef } from "react";
import type { NavigateFunction } from "react-router-dom";
import type { Clue } from "../../../../shared/types/board.ts";
import type { BuzzPayload } from "../../../types/Game.ts";

function norm(v: unknown) {
  return String(v ?? "")
    .trim()
    .toLowerCase();
}

type UseGameCommandsArgs = {
  gameId?: string;
  myUsername: string;
  sendJson: (payload: object) => void;
  clearSession: () => void;
  navigate: NavigateFunction;
  isFinalJeopardy: boolean;
  allWagersSubmitted: boolean;
  wagers: Record<string, number>;
  canSelectClue: boolean;
  buzzResult: string | null;
  buzzLockedOut: boolean;
  perfNowMs: () => number;
  nowFromPerfMs: () => number;
  lastSyncAgeMs?: () => number;
  setLastQuestionValue: (value: number) => void;
};

export function useGameCommands({
  gameId,
  myUsername,
  sendJson,
  clearSession,
  navigate,
  isFinalJeopardy,
  allWagersSubmitted,
  wagers,
  canSelectClue,
  buzzResult,
  buzzLockedOut,
  perfNowMs,
  nowFromPerfMs,
  lastSyncAgeMs,
  setLastQuestionValue,
}: UseGameCommandsArgs) {
  const buzzSeqRef = useRef(0);

  const handleScoreUpdate = useCallback(
    (playerUsername: string, delta: number) => {
      if (!gameId) return;
      const u = norm(playerUsername);
      if (!u) return;

      if (isFinalJeopardy && allWagersSubmitted) {
        const w = Math.abs(wagers[u] ?? 0);
        delta = delta < 0 ? -w : w;
      }

      sendJson({ type: "update-score", gameId, username: u, delta });
    },
    [gameId, isFinalJeopardy, allWagersSubmitted, wagers, sendJson],
  );

  const leaveGame = useCallback(() => {
    if (!gameId) {
      clearSession();
      navigate("/");
      return;
    }

    sendJson({ type: "leave-game", gameId, username: myUsername });
    clearSession();
    navigate("/");
  }, [gameId, myUsername, sendJson, clearSession, navigate]);

  const handleBuzz = useCallback(() => {
    if (!gameId) return;
    if (buzzResult || buzzLockedOut) return;

    const clientBuzzPerfMs = perfNowMs();
    const clientSeq = ++buzzSeqRef.current;
    const syncAge = lastSyncAgeMs?.() ?? Number.POSITIVE_INFINITY;

    const payload: BuzzPayload = {
      type: "buzz",
      gameId,
      clientBuzzPerfMs,
      clientSeq,
      syncAgeMs: syncAge,
    };

    if (Number.isFinite(syncAge) && syncAge <= 20_000) {
      payload.estimatedServerBuzzAtMs = nowFromPerfMs();
    }

    sendJson(payload);
  }, [gameId, buzzResult, buzzLockedOut, perfNowMs, lastSyncAgeMs, nowFromPerfMs, sendJson]);

  const onClueSelected = useCallback(
    (clue: Clue) => {
      if (!canSelectClue || !clue || !gameId) return;

      sendJson({ type: "clue-selected", gameId, clue });
      if (clue.value !== undefined) setLastQuestionValue(clue.value);
    },
    [canSelectClue, gameId, sendJson, setLastQuestionValue],
  );

  return { handleScoreUpdate, leaveGame, handleBuzz, onClueSelected };
}

import { useCallback, useEffect, useMemo } from "react";
import { useWebSocket } from "../../../contexts/WebSocketContext";
import { routeGameSocketMessage } from "./useGameSocketSync.router.ts";
import { normalizeSocketUsername } from "./useGameSocketSync.helpers.ts";
import { useGameSocketSyncState } from "./useGameSocketSync.state.ts";
import type { UseGameSocketSyncArgs, UseGameSocketSyncResult } from "./useGameSocketSync.types.ts";

export type {
  AnswerCaptureStartMsg,
  AnswerProcessingMsg,
  DailyDoubleShowModalMsg,
  DailyDoubleWagerCaptureStartMsg,
} from "./useGameSocketSync.types.ts";

export function useGameSocketSync({
  gameId,
  username,
}: UseGameSocketSyncArgs): UseGameSocketSyncResult {
  const { isSocketReady, sendJson, subscribe, nowMs } = useWebSocket();

  const myUsername = normalizeSocketUsername(username);
  const { state, routerBaseDeps } = useGameSocketSyncState(myUsername);

  const routerDeps = useMemo(
    () => ({
      ...routerBaseDeps,
      gameId,
      myUsername,
      nowMs,
    }),
    [routerBaseDeps, gameId, myUsername, nowMs],
  );

  useEffect(() => {
    if (!isSocketReady) return;

    return subscribe((message) => {
      routeGameSocketMessage(message, routerDeps);
    });
  }, [isSocketReady, subscribe, routerDeps]);

  const markAllCluesComplete = useCallback(() => {
    if (!gameId) return;
    sendJson({ type: "mark-all-complete", gameId });
  }, [gameId, sendJson]);

  return {
    isSocketReady,
    markAllCluesComplete,
    ...state,
  };
}

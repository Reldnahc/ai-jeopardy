import { useEffect, useRef } from "react";
import type { GameSession } from "../../../hooks/useGameSession.ts";

type UseGameSessionSyncArgs = {
  gameId?: string;
  isSocketReady: boolean;
  host: string | null;
  myUsername: string;
  myDisplayname: string;
  username: string | null;
  playerKey: string | null;
  isHost: boolean;
  session: GameSession | null;
  saveSession: (session: GameSession) => void;
  sendJson: (payload: object) => void;
};

export function useGameSessionSync({
  gameId,
  isSocketReady,
  host,
  myUsername,
  myDisplayname,
  username,
  playerKey,
  isHost,
  session,
  saveSession,
  sendJson,
}: UseGameSessionSyncArgs) {
  const gameReadySentRef = useRef(false);

  useEffect(() => {
    if (gameReadySentRef.current) return;
    if (!isSocketReady || !gameId || !myUsername || !host) return;
    gameReadySentRef.current = true;
    sendJson({ type: "game-ready", gameId, username: myUsername });
  }, [isSocketReady, gameId, myUsername, host, sendJson]);

  useEffect(() => {
    if (!gameId || !myDisplayname) return;

    const same =
      session?.gameId === gameId &&
      String(session?.playerKey ?? "") === String(playerKey ?? "") &&
      (session?.username ?? null) === (username ?? null) &&
      String(session?.displayname ?? "") === myDisplayname &&
      session?.isHost === isHost;
    if (same) return;

    saveSession({
      gameId,
      playerKey: String(playerKey ?? ""),
      username: username ?? null,
      displayname: myDisplayname,
      isHost: Boolean(isHost),
    });
  }, [gameId, playerKey, username, myDisplayname, isHost, saveSession, session]);

  useEffect(() => {
    if (!isSocketReady || !gameId || !myUsername) return;

    sendJson({
      type: "join-game",
      gameId,
      username: myUsername,
      displayname: myDisplayname || null,
      playerKey,
    });
  }, [gameId, isSocketReady, myUsername, myDisplayname, playerKey, sendJson]);
}

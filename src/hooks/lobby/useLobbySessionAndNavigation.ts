import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useGameSession } from "../useGameSession.ts";

type Params = {
  lobbyInvalid: boolean;
  allowLeave: boolean;
  isSocketReady: boolean;
  gameId?: string;
  username?: string | null;
  displayname?: string | null;
  isHost: boolean;
  host?: string | null;
  playerKey?: string | null;
};

export function useLobbySessionAndNavigation({
  lobbyInvalid,
  allowLeave,
  isSocketReady,
  gameId,
  username,
  displayname,
  isHost,
  host,
  playerKey,
}: Params) {
  const navigate = useNavigate();
  const { session, saveSession } = useGameSession();

  useEffect(() => {
    if (!lobbyInvalid) return;
    navigate("/");
  }, [lobbyInvalid, navigate]);

  useEffect(() => {
    if (!gameId || !username) return;

    const shouldUpdate =
      session?.gameId !== gameId ||
      session?.username !== username ||
      session?.isHost !== Boolean(isHost);

    if (!shouldUpdate) return;

    saveSession({
      gameId,
      playerKey: playerKey ?? "",
      username,
      displayname: displayname || username,
      isHost: Boolean(isHost),
    });
  }, [gameId, username, isHost, session?.gameId, session?.username, session?.isHost, saveSession, playerKey, displayname]);

  useEffect(() => {
    if (!allowLeave) return;
    if (!isSocketReady) return;
    if (!gameId) return;

    navigate(`/game/${gameId}`, {
      state: {
        username,
        displayname,
        isHost,
        host,
      },
    });
  }, [allowLeave, isSocketReady, gameId, isHost, host, navigate, username, displayname]);
}

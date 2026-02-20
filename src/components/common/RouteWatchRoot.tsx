import { Outlet, useLocation } from "react-router-dom";
import { useEffect, useRef } from "react";
import { useWebSocket } from "../../contexts/WebSocketContext";
import { useGameSession } from "../../hooks/useGameSession";

export default function RouteWatchRoot() {
  const location = useLocation();
  const prevPathRef = useRef(location.pathname);

  const { isSocketReady, sendJson } = useWebSocket();
  const { session } = useGameSession();

  useEffect(() => {
    const prev = prevPathRef.current;
    const curr = location.pathname;
    prevPathRef.current = curr;

    const leftLobby = prev.startsWith("/lobby/") && !curr.startsWith("/lobby/");
    if (!leftLobby) return;

    const match = prev.match(/^\/lobby\/([^/]+)/);
    const lobbyId = match?.[1];
    if (!lobbyId) return;

    const playerName = session?.username;
    if (!playerName) return;
    if (!isSocketReady) return;

    sendJson({ type: "leave-lobby", gameId: lobbyId, playerId: playerName });
  }, [location.pathname, isSocketReady, sendJson, session?.username]);

  return <Outlet />;
}

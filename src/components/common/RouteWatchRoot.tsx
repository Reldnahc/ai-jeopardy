import { Outlet, useLocation } from "react-router-dom";
import { useCallback, useEffect, useRef } from "react";
import { useWebSocket } from "../../contexts/WebSocketContext";
import { useGameSession } from "../../hooks/useGameSession";

export default function RouteWatchRoot() {
  const location = useLocation();
  const prevPathRef = useRef(location.pathname);
  const lastLeaveKeyRef = useRef<string>("");

  const { isSocketReady, sendJson } = useWebSocket();
  const { session } = useGameSession();

  const getPlayerKeyForLobby = useCallback((gameId: string) => {
    if (!gameId) return null;
    const storageKey = `aj_playerKey_${gameId}`;
    try {
      const stored = localStorage.getItem(storageKey);
      if (stored && stored.trim()) return stored.trim();
    } catch {
      // ignore storage errors
    }
    return null;
  }, []);

  const sendLeaveLobby = useCallback(
    (gameId: string) => {
      if (!gameId) return;
      const playerKey = session?.playerKey ?? getPlayerKeyForLobby(gameId);
      const username = session?.username;
      const leaveKey = `${gameId}|${playerKey ?? ""}|${username ?? ""}`;
      if (lastLeaveKeyRef.current === leaveKey) return;
      lastLeaveKeyRef.current = leaveKey;

      sendJson({ type: "leave-lobby", gameId, playerKey, username });
    },
    [getPlayerKeyForLobby, sendJson, session?.playerKey, session?.username],
  );

  useEffect(() => {
    const prev = prevPathRef.current;
    const curr = location.pathname;
    prevPathRef.current = curr;

    const leftLobby = prev.startsWith("/lobby/") && !curr.startsWith("/lobby/");
    if (!leftLobby) return;

    const match = prev.match(/^\/lobby\/([^/]+)/);
    const lobbyId = match?.[1];
    if (!lobbyId) return;

    sendLeaveLobby(lobbyId);
  }, [location.pathname, sendLeaveLobby]);

  useEffect(() => {
    const handlePageHide = () => {
      const path = location.pathname;
      if (!path.startsWith("/lobby/")) return;
      const match = path.match(/^\/lobby\/([^/]+)/);
      const lobbyId = match?.[1];
      if (!lobbyId) return;
      sendLeaveLobby(lobbyId);
    };

    window.addEventListener("pagehide", handlePageHide);
    window.addEventListener("beforeunload", handlePageHide);
    return () => {
      window.removeEventListener("pagehide", handlePageHide);
      window.removeEventListener("beforeunload", handlePageHide);
    };
  }, [location.pathname, sendLeaveLobby]);

  return <Outlet />;
}

import { useCallback } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useWebSocket } from "../../contexts/WebSocketContext.tsx";
import { useGameSession } from "../../hooks/useGameSession.ts";

export default function Footer() {
  const location = useLocation();
  const navigate = useNavigate();
  const { sendJson } = useWebSocket();
  const { session } = useGameSession();

  const leaveLobbyIfNeeded = useCallback(() => {
    const path = location.pathname;
    if (!path.startsWith("/lobby/")) return;
    const match = path.match(/^\/lobby\/([^/]+)/);
    const lobbyId = match?.[1];
    if (!lobbyId) return;

    sendJson({
      type: "leave-lobby",
      gameId: lobbyId,
      playerKey: session?.playerKey,
      username: session?.username,
    });
  }, [location.pathname, sendJson, session?.playerKey, session?.username]);

  const handleFooterNav = useCallback(
    (to: string) => {
      leaveLobbyIfNeeded();
      window.scrollTo(0, 0);
      navigate(to);
    },
    [leaveLobbyIfNeeded, navigate],
  );

  return (
    <footer className="bg-transparent text-white py-4 mt-6">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* About Section */}
          <div className="flex flex-col items-center md:items-start">
            <h3 className="text-xl font-extrabold"></h3>
            <p className="mt-2 text-center md:text-left text-sm"></p>
          </div>

          {/* Links Section */}
          <div className="flex flex-col items-center">
            <h3 className="text-xl font-extrabold">Quick Links</h3>
            <ul className="mt-2 grid grid-cols-2 gap-x-6 gap-y-1 text-sm text-center">
              <li>
                <Link
                  to="/"
                  className="hover:underline"
                  onClick={(e) => {
                    e.preventDefault();
                    handleFooterNav("/");
                  }}
                >
                  Home
                </Link>
              </li>
              <li>
                <Link
                  to="/recent-boards"
                  className="hover:underline"
                  onClick={(e) => {
                    e.preventDefault();
                    handleFooterNav("/recent-boards");
                  }}
                >
                  Recent Boards
                </Link>
              </li>
              <li>
                <Link
                  to="/leaderboards"
                  className="hover:underline"
                  onClick={(e) => {
                    e.preventDefault();
                    handleFooterNav("/leaderboards");
                  }}
                >
                  Leaderboards
                </Link>
              </li>
              <li>
                <Link
                  to="/model-info"
                  className="hover:underline"
                  onClick={(e) => {
                    e.preventDefault();
                    handleFooterNav("/model-info");
                  }}
                >
                  Model Info
                </Link>
              </li>
              <li>
                <Link
                  to="/board-creator"
                  className="hover:underline"
                  onClick={(e) => {
                    e.preventDefault();
                    handleFooterNav("/board-creator");
                  }}
                >
                  Board Creator
                </Link>
              </li>
            </ul>
          </div>

          {/* Contact Section */}
          <div className="flex flex-col items-center md:items-end">
            <h3 className="text-xl font-extrabold">Contact Us</h3>
            <p className="mt-2 text-center md:text-right text-sm">Discord coming soon!</p>
          </div>
        </div>

        {/* Footer Bottom Section */}
        <div className="mt-5 text-center border-t border-gray-200 pt-3">
          <p className="text-xs text-gray-100 font-light">
            (c) {new Date().getFullYear()} AI Jeopardy. All rights reserved.
          </p>
        </div>
      </div>
    </footer>
  );
}

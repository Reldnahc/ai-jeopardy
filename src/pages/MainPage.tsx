import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useWebSocket } from "../contexts/WebSocketContext.tsx";
import { useAuth } from "../contexts/AuthContext.tsx";
import { useAlert } from "../contexts/AlertContext.tsx";
import PlayerSearch from "../components/main/PlayerSearch.tsx";
import { Player } from "../types/Lobby.ts";
import { getUniqueCategories } from "../categories/getUniqueCategories.ts";
import { useGameSession } from "../hooks/useGameSession.ts";

function getOrCreatePlayerKey(): string {
  const key = "playerKey";
  const existing = localStorage.getItem(key);
  if (existing && existing.trim()) return existing;

  const created =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(16).slice(2)}`;

  localStorage.setItem(key, created);
  return created;
}

export default function MainPage() {
  const [gameId, setGameId] = useState("");
  const [isCreatingLobby, setIsCreatingLobby] = useState(false);
  const [cotd, setCotd] = useState({ category: "Connecting to server...", description: "" });

  const { saveSession } = useGameSession();
  const { showAlert } = useAlert();
  const { user, loading: authLoading } = useAuth();
  const { isSocketReady, sendJson, subscribe } = useWebSocket();
  const navigate = useNavigate();

  const adjectives = ["Hallucinated", "Intelligent", "Dreamt", "Generated", "Conjured", "Created"];
  const randomAdjective = useMemo(
    () => adjectives[Math.floor(Math.random() * adjectives.length)],
    [],
  );

  // canonical identity
  const username = (user?.username || "").trim().toLowerCase();
  const displayname = (user?.displayname || user?.username || "").trim();
  const myName = displayname;

  const playerKey = useMemo(() => getOrCreatePlayerKey(), []);

  useEffect(() => {
    if (!isSocketReady) return;

    return subscribe((message) => {
      switch (message.type) {
        case "category-of-the-day": {
          const m = message as unknown as { cotd: { category: string; description: string } };
          setCotd(m.cotd);
          return;
        }

        case "lobby-created": {
          const m = message as unknown as {
            gameId: string;
            players: Player[];
            categories: string[];
          };

          setIsCreatingLobby(false);

          if (!username || !displayname) return;

          saveSession({
            gameId: m.gameId,
            playerKey,
            username,
            displayname,
            isHost: true,
          });

          navigate(`/lobby/${m.gameId}`, {
            state: {
              playerName: myName,
              isHost: true,
              players: m.players,
              categories: m.categories,
            },
          });

          sendJson({ type: "request-lobby-state", gameId: m.gameId });
          return;
        }

        case "check-lobby-response": {
          const m = message as unknown as { isValid: boolean; gameId: string };

          if (m.isValid) {
            // Pre-save the session so the lobby page can join/reconnect cleanly
            if (username && displayname) {
              saveSession({
                gameId: m.gameId,
                playerKey,
                username,
                displayname,
                isHost: false,
              });
            }

            navigate(`/lobby/${m.gameId}`, {
              state: {
                playerName: myName,
                isHost: false,
              },
            });
          } else {
            showAlert(
              <span>
                <span className="text-red-500 font-bold text-xl">
                  Invalid lobby or game already in progress.
                </span>
                <br />
              </span>,
              [
                {
                  label: "Okay",
                  actionValue: "okay",
                  styleClass: "bg-green-500 text-white hover:bg-green-600",
                },
              ],
            );
          }
          return;
        }

        default:
          return;
      }
    });
  }, [
    isSocketReady,
    subscribe,
    navigate,
    showAlert,
    myName,
    sendJson,
    saveSession,
    username,
    displayname,
    playerKey,
  ]);

  useEffect(() => {
    if (!isSocketReady) return;
    sendJson({ type: "check-cotd" });
  }, [isSocketReady, sendJson]);

  const handleGenerateRandomCategories = () => {
    return getUniqueCategories(11);
  };

  function sendErrorAlert() {
    void showAlert(
      <span>
        <span className="text-red-500 font-bold text-xl">Connection to Websockets failed.</span>
        <br />
        <span className="text-gray-900 font-semibold">Please refresh the page and try again.</span>
      </span>,
      [
        {
          label: "Okay",
          actionValue: "okay",
          styleClass: "bg-green-500 text-white hover:bg-green-600",
        },
      ],
    );
  }

  const handleCreateGame = async () => {
    if (isCreatingLobby) return;

    // wait for auth to finish initializing
    if (authLoading) return;

    if (!user) {
      void showAlert(
        <span>
          <span className="text-red-500 font-bold text-xl">Please log in to create a game.</span>
          <br />
        </span>,
        [
          {
            label: "Okay",
            actionValue: "okay",
            styleClass: "bg-green-500 text-white hover:bg-green-600",
          },
        ],
      );
      return;
    }

    if (!username || !displayname) {
      void showAlert(
        <span>
          <span className="text-red-500 font-bold text-xl">Your profile name is missing.</span>
          <br />
        </span>,
        [
          {
            label: "Okay",
            actionValue: "okay",
            styleClass: "bg-green-500 text-white hover:bg-green-600",
          },
        ],
      );
      return;
    }

    if (isSocketReady) {
      setIsCreatingLobby(true);
      sendJson({
        type: "create-lobby",
        username,
        displayname,
        playerKey,
        categories: handleGenerateRandomCategories(),
      });
    } else {
      sendErrorAlert();
    }
  };

  const handleJoinGame = async () => {
    if (isCreatingLobby) return;

    if (!gameId.trim()) {
      await showAlert(
        <span>
          <span className="text-red-500 font-bold text-xl">Please enter a valid Game ID.</span>
          <br />
        </span>,
        [
          {
            label: "Okay",
            actionValue: "okay",
            styleClass: "bg-green-500 text-white hover:bg-green-600",
          },
        ],
      );
      return;
    }

    // wait for auth init so we don't flash "not logged in"
    if (authLoading) return;

    if (!user) {
      const action = await showAlert(
        <span>
          <span className="text-red-500 font-bold text-xl">You are not logged in.</span>
          <br />
        </span>,
        [
          {
            label: "Go Back",
            actionValue: "return",
            styleClass: "bg-red-500 text-white hover:bg-red-600",
          },
        ],
      );
      if (action === "return") return;
    }

    if (isSocketReady) {
      sendJson({ type: "check-lobby", gameId: gameId.trim() });
    } else {
      sendErrorAlert();
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-r from-indigo-400 to-blue-700 flex items-center justify-center p-6 ">
      {/* Animated container for the main card */}
      <div className="bg-white rounded-xl shadow-2xl overflow-hidden w-full max-w-6xl p-20 pt-4">
        {/* Main Content (spans two columns on medium+ screens) */}
        <div className="col-span-2 p-10">
          <h1 className="text-5xl font-extrabold text-gray-900 text-center">
            Artificially {randomAdjective} Jeopardy
          </h1>
          <p className="text-xl text-gray-700 text-center mt-4">
            Try to answer with the correct question.
          </p>

          {/* Featured Category Card */}
          <div className="mt-10">
            <div className="p-8 bg-gradient-to-br from-gray-50 to-gray-100 rounded-xl border border-gray-200 shadow-sm">
              <div className="text-center mb-6">
                <span className="inline-block text-xl uppercase tracking-wider text-gray-500 font-semibold">
                  Featured Category
                </span>
              </div>

              <h3 className="text-6xl text-shadow-jeopardy font-swiss911 text-yellow-400 tracking-widest text-center mb-3">
                {cotd.category.toUpperCase()}
              </h3>

              <p className="text-lg text-gray-700 text-center max-w-2xl mx-auto leading-relaxed">
                {cotd.description}
              </p>
            </div>
          </div>

          {/* Create & Join Game Section */}
          <div className="mt-8 grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Create Game Box */}
            <div className="flex flex-col justify-center items-center bg-gray-50 p-6 rounded-lg border-gray-200 shadow">
              <button
                onClick={handleCreateGame}
                disabled={isCreatingLobby}
                aria-busy={isCreatingLobby}
                className="w-full h-full py-3 px-6 text-white bg-green-500 hover:bg-green-600 disabled:opacity-60 disabled:cursor-not-allowed text-xl rounded-lg font-semibold transition-colors duration-200"
              >
                {isCreatingLobby ? (
                  <span className="flex items-center justify-center gap-2">
                    <svg className="h-5 w-5 animate-spin" viewBox="0 0 24 24" fill="none">
                      <circle
                        className="opacity-25"
                        cx="12"
                        cy="12"
                        r="10"
                        stroke="currentColor"
                        strokeWidth="4"
                      />
                      <path
                        className="opacity-75"
                        fill="currentColor"
                        d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"
                      />
                    </svg>
                    <span>Creating…</span>
                  </span>
                ) : (
                  "Create Game"
                )}
              </button>

              {isCreatingLobby && (
                <p className="mt-3 text-sm text-gray-600 text-center">
                  Creating lobby… this can take a few seconds.
                </p>
              )}
            </div>

            {/* Join Game Box */}
            <div className="bg-gray-50 p-6 rounded-lg border border-gray-200 shadow">
              <div className="flex flex-col gap-4">
                <div className="flex flex-col">
                  <label htmlFor="gameId" className="text-lg font-medium text-gray-800">
                    Game ID:
                  </label>
                  <input
                    id="gameId"
                    type="text"
                    value={gameId}
                    onChange={(e) => setGameId(e.target.value)}
                    placeholder="Enter Game ID to join"
                    className="mt-2 p-3 border border-gray-300 text-black rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <button
                  onClick={handleJoinGame}
                  disabled={isCreatingLobby}
                  aria-busy={isCreatingLobby}
                  className="py-3 px-6 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded transition-colors duration-200"
                >
                  Join Game
                </button>
              </div>
            </div>
          </div>

          <div className="mt-8">
            <div className="p-6 bg-gray-50 rounded-lg border border-gray-200 shadow-sm">
              <PlayerSearch />
            </div>
          </div>

          {/* How to Play Section */}
          <div className="mt-8">
            <details className="bg-gray-50 p-6 rounded-lg border border-gray-200 shadow" open>
              <summary className="text-2xl font-semibold text-gray-800 cursor-pointer">
                How to Play
              </summary>

              <p className="mt-4 text-lg text-gray-700">
                Welcome to <strong>AI Jeopardy!</strong> This is a multiplayer game inspired by the
                classic TV show. The project is still evolving, so thank you for your patience as
                new features are added and improved.
              </p>

              <h3 className="mt-6 text-xl font-semibold text-gray-800">Getting Started</h3>
              <ul className="list-disc ml-6 mt-3 text-lg text-gray-700 space-y-2">
                <li>
                  You must create an account using the menu in the top-right corner to host or join
                  a game.
                </li>
                <li>
                  Once in a lobby, players choose the categories they’d like questions generated
                  from.
                </li>
                <li>
                  When everyone is ready, the host presses <strong>“Start Game”</strong> to begin.
                </li>
              </ul>

              <h3 className="mt-6 text-xl font-semibold text-gray-800">How Jeopardy Works</h3>
              <ul className="list-disc ml-6 mt-3 text-lg text-gray-700 space-y-2">
                <li>
                  The board contains categories with increasing dollar values. Higher values are
                  more difficult.
                </li>
                <li>The player who answered the previous clue correctly selects the next clue.</li>
                <li>The AI reads the clue aloud. After it finishes, the buzzer unlocks.</li>
                <li>
                  Players race to buzz in. The first player to buzz gets the chance to answer.
                </li>
                <li>If the answer is correct, that player earns the clue’s dollar value.</li>
                <li>
                  If the answer is incorrect, that player is <strong>locked out</strong> from
                  buzzing on that clue again, and other players may buzz in.
                </li>
                <li>
                  If no one answers correctly before time runs out, the answer is revealed and no
                  points are awarded.
                </li>
              </ul>

              <h3 className="mt-6 text-xl font-semibold text-gray-800">Final Jeopardy</h3>
              <ul className="list-disc ml-6 mt-3 text-lg text-gray-700 space-y-2">
                <li>
                  After all clues are played, the game moves to <strong>Final Jeopardy</strong>.
                </li>
                <li>Players secretly submit a wager based on their current score.</li>
                <li>The final clue is revealed, and all players submit their answers.</li>
                <li>
                  Correct answers add the wagered amount to the player’s score. Incorrect answers
                  subtract it.
                </li>
                <li>The player with the highest total score at the end wins!</li>
              </ul>

              <p className="mt-6 text-lg text-gray-700">
                Most importantly—have fun, compete, and enjoy the experience!
              </p>
            </details>
          </div>
        </div>
      </div>
    </div>
  );
}

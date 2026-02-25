import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useWebSocket } from "../contexts/WebSocketContext.tsx";
import { useAuth } from "../contexts/AuthContext.tsx";
import { useAlert } from "../contexts/AlertContext.tsx";
import PlayerSearch from "../components/main/PlayerSearch.tsx";
import PageCardContainer from "../components/common/PageCardContainer.tsx";
import MainHeader from "../components/main/mainPage/MainHeader.tsx";
import FeaturedCategoryCard from "../components/main/mainPage/FeaturedCategoryCard.tsx";
import GameActionsSection from "../components/main/mainPage/GameActionsSection.tsx";
import DiscoveryLinks from "../components/main/mainPage/DiscoveryLinks.tsx";
import HowToPlaySection from "../components/main/mainPage/HowToPlaySection.tsx";
import { Player } from "../types/Lobby.ts";
import { getUniqueCategories } from "../categories/getUniqueCategories.ts";
import { useGameSession } from "../hooks/useGameSession.ts";

const ADJECTIVES = ["Hallucinated", "Intelligent", "Dreamt", "Generated", "Conjured", "Created"];

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

  const randomAdjective = useMemo(
    () => ADJECTIVES[Math.floor(Math.random() * ADJECTIVES.length)],
    [],
  );

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
          const m = message as unknown as {
            isValid: boolean;
            isFull?: boolean;
            maxPlayers?: number;
            gameId: string;
          };

          if (m.isFull) {
            void showAlert(
              "Lobby Full",
              typeof m.maxPlayers === "number"
                ? `Lobby is full (max ${m.maxPlayers} players).`
                : "Lobby is full.",
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

          if (m.isValid) {
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
              "Lobby Unavailable",
              <span>Invalid lobby or game already in progress.</span>,
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
    void showAlert("Connection Error", <span>Please refresh the page and try again.</span>, [
      {
        label: "Okay",
        actionValue: "okay",
        styleClass: "bg-green-500 text-white hover:bg-green-600",
      },
    ]);
  }

  const handleCreateGame = async () => {
    if (isCreatingLobby) return;
    if (authLoading) return;

    if (!user) {
      void showAlert("Login Required", <span>Please log in to create a game.</span>, [
        {
          label: "Okay",
          actionValue: "okay",
          styleClass: "bg-green-500 text-white hover:bg-green-600",
        },
      ]);
      return;
    }

    if (!username || !displayname) {
      void showAlert("Profile Incomplete", <span>Your profile name is missing.</span>, [
        {
          label: "Okay",
          actionValue: "okay",
          styleClass: "bg-green-500 text-white hover:bg-green-600",
        },
      ]);
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
      await showAlert("Invalid Game ID", <span>Please enter a valid Game ID.</span>, [
        {
          label: "Okay",
          actionValue: "okay",
          styleClass: "bg-green-500 text-white hover:bg-green-600",
        },
      ]);
      return;
    }

    if (authLoading) return;

    if (!user) {
      const action = await showAlert("Login Required", <span>You are not logged in.</span>, [
        {
          label: "Go Back",
          actionValue: "return",
          styleClass: "bg-red-500 text-white hover:bg-red-600",
        },
      ]);
      if (action === "return") return;
    }

    if (isSocketReady) {
      sendJson({ type: "check-lobby", gameId: gameId.trim(), username, playerKey });
    } else {
      sendErrorAlert();
    }
  };

  return (
    <div className="min-h-screen flex flex-col items-center px-4 py-6 md:px-6">
      <PageCardContainer className="relative overflow-hidden border border-white/50 bg-white/94 shadow-[0_20px_48px_-28px_rgba(15,23,42,0.45)]">
        <div className="pointer-events-none absolute -top-24 -right-16 h-60 w-60 rounded-full bg-blue-200/25 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-20 -left-14 h-52 w-52 rounded-full bg-cyan-100/25 blur-3xl" />
        <div className="pointer-events-none absolute top-40 left-1/2 h-36 w-36 -translate-x-1/2 rounded-full bg-indigo-100/20 blur-3xl" />

        <div className="relative mx-auto w-full max-w-5xl p-6 md:p-10">
          <MainHeader randomAdjective={randomAdjective} />

          <div className="mt-6 md:mt-8">
            <FeaturedCategoryCard cotd={cotd} />
          </div>

          <div className="mt-6">
            <GameActionsSection
              gameId={gameId}
              isCreatingLobby={isCreatingLobby}
              onGameIdChange={setGameId}
              onCreateGame={handleCreateGame}
              onJoinGame={handleJoinGame}
            />
          </div>

          <div className="mt-6 md:mt-8">
            <DiscoveryLinks />
          </div>

          <div className="mt-6">
            <div className="p-5 md:p-6 bg-white/80 rounded-2xl border border-slate-200 shadow-sm">
              <PlayerSearch />
            </div>
          </div>

          <div className="mt-6">
            <HowToPlaySection />
          </div>
        </div>
      </PageCardContainer>
    </div>
  );
}

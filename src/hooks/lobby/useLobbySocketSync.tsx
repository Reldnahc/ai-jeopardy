import React, { useCallback, useEffect, useRef, useState } from "react";
import { useWebSocket } from "../../contexts/WebSocketContext";
import type { Player } from "../../types/Lobby";
import type { LobbyBoardType } from "../../components/lobby/CategoryBoard";
import { type BoardType, CATEGORY_SECTIONS, unflattenBySections } from "../../utils/lobbySections";
import { AlertButton } from "../../contexts/AlertContext.tsx";

type LockedCategories = {
  firstBoard: boolean[];
  secondBoard: boolean[];
  finalJeopardy: boolean[];
};

export type LobbySettings = {
  timeToBuzz: number;
  timeToAnswer: number;
  selectedModel: string;
  reasoningEffort: "off" | "low" | "medium" | "high";
  visualMode: "off" | "commons" | "brave";
  narrationEnabled: boolean;
  boardJson: string;
};

type UseLobbySocketSyncArgs = {
  gameId?: string;
  playerKey: string | null;
  username: string | null;
  displayname: string | null;
  showAlert: (node: React.ReactNode, actions: AlertButton[]) => Promise<string>;
};

export function useLobbySocketSync({
  gameId,
  playerKey,
  username,
  displayname,
  showAlert,
}: UseLobbySocketSyncArgs) {
  const { isSocketReady, sendJson, subscribe } = useWebSocket();
  const [lobbyInvalid, setLobbyInvalid] = useState(false);
  const [invalidReason, setInvalidReason] = useState<
    "missing_identity" | "not_found_or_started" | null
  >(null);

  const [isLoading, setIsLoading] = useState(false);
  const [loadingMessage, setLoadingMessage] = useState("");
  const [loadingProgress, setLoadingProgress] = useState<number | null>(null);

  const [players, setPlayers] = useState<Player[]>([]);
  const [host, setHost] = useState<string | null>(null);
  const [isHostServer, setIsHostServer] = useState(false);

  const [allowLeave, setAllowLeave] = useState(false);
  const [preloadAssetIds, setPreloadAssetIds] = useState<string[] | null>(null);
  const [isPreloadingImages, setIsPreloadingImages] = useState(false);

  const [preloadTtsAssetIds, setPreloadTtsAssetIds] = useState<string[] | null>(null);
  const [isPreloadingAudio, setIsPreloadingAudio] = useState(false);

  const [preloadToken, setPreloadToken] = useState<number | null>(null);
  const [preloadFinalToken, setPreloadFinalToken] = useState<number | null>(null);

  const [categories, setCategories] = useState<Record<BoardType, string[]>>(() => ({
    firstBoard: Array(CATEGORY_SECTIONS[0].count).fill(""),
    secondBoard: Array(CATEGORY_SECTIONS[1].count).fill(""),
    finalJeopardy: Array(CATEGORY_SECTIONS[2].count).fill(""),
  }));

  const [lockedCategories, setLockedCategories] = useState<LockedCategories>({
    firstBoard: Array(CATEGORY_SECTIONS[0].count).fill(false),
    secondBoard: Array(CATEGORY_SECTIONS[1].count).fill(false),
    finalJeopardy: Array(CATEGORY_SECTIONS[2].count).fill(false),
  });

  const [lobbySettings, setLobbySettings] = useState<LobbySettings | null>(null);

  // --- outbound helpers (these stay stable and keep Lobby.tsx simple)
  const setManualLoading = useCallback((message: string) => {
    setIsLoading(true);
    setLoadingMessage(message);
  }, []);

  const clearLoading = useCallback(() => {
    setIsLoading(false);
    setLoadingMessage("");
  }, []);

  const onPromoteHost = useCallback(
    (targetUsername: string) => {
      if (!isSocketReady || !gameId) return;
      sendJson({ type: "promote-host", gameId, targetUsername });
    },
    [isSocketReady, gameId, sendJson],
  );

  const onToggleLock = useCallback(
    (boardType: LobbyBoardType, index: number) => {
      if (!isSocketReady || !gameId) return;
      sendJson({ type: "toggle-lock-category", gameId, boardType, index });
    },
    [isSocketReady, gameId, sendJson],
  );

  const onChangeCategory = useCallback(
    (boardType: LobbyBoardType, index: number, value: string) => {
      setCategories((prev) => {
        const updatedBoard = [...(prev[boardType] ?? [])];
        if (index >= 0 && index < updatedBoard.length) updatedBoard[index] = value;
        return { ...prev, [boardType]: updatedBoard };
      });

      if (gameId) {
        sendJson({ type: "update-category", gameId, boardType, index, value });
      }
    },
    [gameId, sendJson],
  );

  const requestLobbyState = useCallback(() => {
    if (!isSocketReady || !gameId) return;
    sendJson({ type: "request-lobby-state", gameId, playerKey });
  }, [isSocketReady, gameId, playerKey, sendJson]);

  const updateLobbySettings = useCallback(
    (patch: Partial<LobbySettings>) => {
      if (!isSocketReady || !gameId) return;
      sendJson({ type: "update-lobby-settings", gameId, patch });
    },
    [isSocketReady, gameId, sendJson],
  );

  // --- join / request snapshot (moved from Lobby.tsx)

  const lastJoinKeyRef = useRef<string>("");

  useEffect(() => {
    if (!isSocketReady) return;
    if (!gameId) return;
    if (!username) return;

    const joinIdentity = `${gameId}|${username}|${playerKey}`;

    if (lastJoinKeyRef.current === joinIdentity) {
      return; // don't re-join just because cosmetics changed
    }

    lastJoinKeyRef.current = joinIdentity;

    sendJson({
      type: "join-lobby",
      gameId,
      displayname,
      username,
      playerKey,
    });
    requestLobbyState();
  }, [isSocketReady, gameId, username, displayname, playerKey, sendJson, requestLobbyState]);

  // --- inbound message handling (moved from Lobby.tsx)

  useEffect(() => {
    if (!isSocketReady) return;
    if (!gameId) return;

    const unsubscribe = subscribe((message) => {
      // console.log(message);

      switch (message.type) {
        case "player-list-update": {
          const m = message as unknown as { players: Player[]; host: string };

          const hostUsername = String(m.host ?? "")
            .trim()
            .toLowerCase();

          // sort host to top by USERNAME, not displayname
          const sortedPlayers = [...(m.players ?? [])].sort((a, b) => {
            const au = String(a.username ?? "")
              .trim()
              .toLowerCase();
            const bu = String(b.username ?? "")
              .trim()
              .toLowerCase();
            if (au === hostUsername) return -1;
            if (bu === hostUsername) return 1;
            return 0;
          });

          setPlayers(sortedPlayers);
          setHost(hostUsername || null);

          const youU = String(username ?? "")
            .trim()
            .toLowerCase();
          setIsHostServer(Boolean(hostUsername) && Boolean(youU) && hostUsername === youU);
          return;
        }

        case "lobby-state": {
          const m = message as unknown as {
            players: Player[];
            host: string;
            categories?: string[];
            inLobby?: boolean;
            isGenerating?: boolean;
            isLoading?: boolean;
            generationProgress?: number | null;
            lockedCategories?: LockedCategories;
            you?: { isHost?: boolean; playerName?: string; playerKey?: string };
            lobbySettings?: LobbySettings | null;
          };

          setPlayers(Array.isArray(m.players) ? m.players : []);
          setHost(m.host ?? null);

          const hostUsername = String(m.host ?? "")
            .trim()
            .toLowerCase();
          const youUsername = String(username ?? "")
            .trim()
            .toLowerCase();

          setIsHostServer(
            Boolean(m.you?.isHost) ||
              (!!hostUsername && !!youUsername && hostUsername === youUsername),
          );

          if (Array.isArray(m.categories)) {
            setCategories(unflattenBySections(m.categories));
          }

          if (m.lockedCategories) {
            setLockedCategories({
              firstBoard: m.lockedCategories.firstBoard,
              secondBoard: m.lockedCategories.secondBoard,
              finalJeopardy: m.lockedCategories.finalJeopardy,
            });
          }

          if (m.lobbySettings) {
            setLobbySettings(m.lobbySettings);
          }

          if (m.isGenerating) {
            setIsLoading(true);
            setLoadingMessage("Generating your questions...");
            setLoadingProgress(typeof m.generationProgress === "number" ? m.generationProgress : 0);
            return;
          }

          if (m.isLoading === false) {
            return;
          }

          if (m.inLobby === false) {
            setAllowLeave(true);
            return;
          }

          setIsLoading(false);
          setLoadingMessage("");
          return;
        }

        case "category-lock-updated": {
          const m = message as unknown as { boardType: unknown; index: number; locked: boolean };
          const bt = m.boardType;

          if (bt === "firstBoard" || bt === "secondBoard" || bt === "finalJeopardy") {
            setLockedCategories((prev) => {
              const updated: LockedCategories = { ...prev };
              updated[bt][m.index] = Boolean(m.locked);
              return updated;
            });
          }
          return;
        }

        case "generation-progress": {
          const m = message as unknown as { progress?: unknown };
          const p = typeof m.progress === "number" ? m.progress : 0;
          setLoadingProgress(Math.max(0, Math.min(1, p)));
          return;
        }

        case "category-updated": {
          const m = message as unknown as {
            boardType: "firstBoard" | "secondBoard" | "finalJeopardy";
            index: number;
            value: string;
          };

          setCategories((prev) => {
            const nextBoard = [...(prev[m.boardType] ?? [])];
            if (m.index >= 0 && m.index < nextBoard.length) nextBoard[m.index] = m.value ?? "";
            return { ...prev, [m.boardType]: nextBoard };
          });

          return;
        }

        case "categories-updated": {
          const m = message as unknown as { categories: string[] };
          if (Array.isArray(m.categories)) setCategories(unflattenBySections(m.categories));
          return;
        }

        case "lobby-settings-updated": {
          const m = message as unknown as { lobbySettings?: LobbySettings | null };
          if (m.lobbySettings) setLobbySettings(m.lobbySettings);
          return;
        }

        case "trigger-loading": {
          setIsLoading(true);
          setLoadingMessage("Generating your questions...");
          setLoadingProgress(0);
          return;
        }

        case "create-board-failed": {
          setIsLoading(false);
          setIsPreloadingImages(false);
          setPreloadAssetIds(null);

          const m = message as unknown as { message?: string };

          const alertContent = (
            <span>
              <span className="text-red-500 font-bold text-xl">Failed to start game</span>
              <br />
              <span>{m.message ?? "Unknown error."}</span>
            </span>
          );

          void showAlert(alertContent, [
            {
              label: "Okay",
              actionValue: "okay",
              styleClass: "bg-green-500 text-white hover:bg-green-600",
            },
          ]);

          return;
        }

        case "start-game": {
          setIsPreloadingImages(false);
          setPreloadAssetIds(null);

          setIsLoading(false);
          setAllowLeave(true);
          return;
        }

        case "preload-images": {
          const m = message as {
            assetIds?: string[];
            ttsAssetIds?: string[];
            token?: number;
            final?: boolean;
          };

          const tok = Number(m.token);
          if (Number.isFinite(tok)) setPreloadToken(tok);
          if (m.final && Number.isFinite(tok)) setPreloadFinalToken(tok);

          const nextImages = Array.isArray(m.assetIds) ? m.assetIds.filter(Boolean) : [];
          const nextTts = Array.isArray(m.ttsAssetIds) ? m.ttsAssetIds.filter(Boolean) : [];

          setAllowLeave(false);

          setPreloadAssetIds((prev) => {
            const prevArr = Array.isArray(prev) ? prev : [];
            return Array.from(new Set([...prevArr, ...nextImages]));
          });
          setIsPreloadingImages(true);

          setPreloadTtsAssetIds((prev) => {
            const prevArr = Array.isArray(prev) ? prev : [];
            return Array.from(new Set([...prevArr, ...nextTts]));
          });
          setIsPreloadingAudio(true);

          return;
        }

        case "preload-start": {
          const m = message as { token?: number };
          const tok = Number(m.token);
          setPreloadToken(Number.isFinite(tok) ? tok : 0);
          setPreloadFinalToken(null);

          // reset asset lists / flags so you don’t carry old state
          setPreloadAssetIds(null);
          setPreloadTtsAssetIds(null);
          setIsPreloadingImages(false);
          setIsPreloadingAudio(false);
          return;
        }

        case "check-lobby-response": {
          const m = message as unknown as { isValid: boolean };

          if (!m.isValid) {
            // Lobby no longer exists or already started.
            // If we have an identity, we should enter the game page and let game rehydrate from server.
            if (username) {
              setIsLoading(true);
              setLoadingMessage("Game already started. Joining game...");
              setAllowLeave(true);
              return;
            }

            // No identity: can't recover → page should route home.
            setLobbyInvalid(true);
            setInvalidReason("missing_identity");
            return;
          }

          setLoadingMessage("Syncing lobby state...");
          requestLobbyState();
          return;
        }

        case "error": {
          // ...log it...
          if (gameId) requestLobbyState();
          return;
        }

        default:
          return;
      }
    });

    sendJson({ type: "check-lobby", gameId });

    return unsubscribe;
  }, [isSocketReady, gameId, subscribe, sendJson, username, showAlert, requestLobbyState]);

  return {
    // socket state
    isSocketReady,

    // snapshot + derived
    isLoading,
    setManualLoading,
    clearLoading,
    loadingMessage,
    loadingProgress,
    allowLeave,

    players,
    host,
    isHostServer,
    lobbyInvalid,
    invalidReason,
    categories,
    setCategories,
    lockedCategories,
    setLockedCategories,

    // outbound actions
    onPromoteHost,
    onToggleLock,
    onChangeCategory,
    requestLobbyState,
    lobbySettings,
    updateLobbySettings,
    preloadAssetIds,
    isPreloadingImages,
    preloadTtsAssetIds,
    isPreloadingAudio,
    preloadToken,
    preloadFinalToken,
  };
}

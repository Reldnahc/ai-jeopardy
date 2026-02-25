import { useCallback, useEffect, useRef, useState } from "react";
import { useWebSocket } from "../../../contexts/WebSocketContext";
import type { Player } from "../../../types/Lobby";
import type { LobbyBoardType } from "../components/CategoryBoard";
import { type BoardType, CATEGORY_SECTIONS, unflattenBySections } from "../../../utils/lobbySections";
import { routeLobbySocketMessage } from "./useLobbySocketSync.router.ts";
import type {
  LobbySettings,
  LockedCategories,
  UseLobbySocketSyncArgs,
  CategoryPoolState,
} from "./useLobbySocketSync.types.ts";

export type { LobbySettings } from "./useLobbySocketSync.types.ts";

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
    "missing_identity" | "not_found_or_started" | "full" | null
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
  const [categoryPoolState, setCategoryPoolState] = useState<CategoryPoolState | null>(null);

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

  const lastJoinKeyRef = useRef<string>("");

  useEffect(() => {
    if (!isSocketReady) return;
    if (!gameId) return;
    if (!username) return;

    const joinIdentity = `${gameId}|${username}|${playerKey}`;
    if (lastJoinKeyRef.current === joinIdentity) return;

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

  useEffect(() => {
    if (!isSocketReady) return;
    if (!gameId) return;

    const unsubscribe = subscribe((message) => {
      routeLobbySocketMessage(message as { type?: string; [key: string]: unknown }, {
        gameId,
        username,
        requestLobbyState,
        showAlert,
        setLobbyInvalid,
        setInvalidReason,
        setIsLoading,
        setLoadingMessage,
        setLoadingProgress,
        setPlayers,
        setHost,
        setIsHostServer,
        setAllowLeave,
        setPreloadAssetIds,
        setIsPreloadingImages,
        setPreloadTtsAssetIds,
        setIsPreloadingAudio,
        setPreloadToken,
        setPreloadFinalToken,
        setCategories,
        unflattenBySections,
        setLockedCategories,
        setLobbySettings,
        setCategoryPoolState,
      });
    });

    sendJson({ type: "check-lobby", gameId, username, playerKey });
    return unsubscribe;
  }, [isSocketReady, gameId, subscribe, sendJson, username, showAlert, requestLobbyState]);

  return {
    isSocketReady,
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
    onPromoteHost,
    onToggleLock,
    onChangeCategory,
    requestLobbyState,
    lobbySettings,
    updateLobbySettings,
    categoryPoolState,
    preloadAssetIds,
    isPreloadingImages,
    preloadTtsAssetIds,
    isPreloadingAudio,
    preloadToken,
    preloadFinalToken,
  };
}

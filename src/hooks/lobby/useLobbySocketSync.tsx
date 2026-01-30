import { useCallback, useEffect, useState } from "react";
import { useWebSocket } from "../../contexts/WebSocketContext";
import type { Player } from "../../types/Lobby";
import type { LobbyBoardType } from "../../components/lobby/CategoryBoard";
import { unflattenBySections, type BoardType, CATEGORY_SECTIONS } from "../../utils/lobbySections";
import {AlertButton} from "../../contexts/AlertContext.tsx";

type LockedCategories = {
    firstBoard: boolean[];
    secondBoard: boolean[];
    finalJeopardy: boolean[];
};

type UseLobbySocketSyncArgs = {
    gameId?: string;
    playerKey: string | null;
    effectivePlayerName: string | null;

    // UI integration
    showAlert: (node: React.ReactNode, actions: AlertButton[]) => Promise<string>;
};

export function useLobbySocketSync({
                                       gameId,
                                       playerKey,
                                       effectivePlayerName,
                                       showAlert,
                                   }: UseLobbySocketSyncArgs) {
    const { isSocketReady, sendJson, subscribe } = useWebSocket();
    const [lobbyInvalid, setLobbyInvalid] = useState(false);
    const [invalidReason, setInvalidReason] = useState<"missing_identity" | "not_found_or_started" | null>(null);

    const [isLoading, setIsLoading] = useState(false);
    const [loadingMessage, setLoadingMessage] = useState("");

    const [players, setPlayers] = useState<Player[]>([]);
    const [host, setHost] = useState<string | null>(null);
    const [isHostServer, setIsHostServer] = useState(false);

    const [allowLeave, setAllowLeave] = useState(false);

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
        (playerName: string) => {
            if (!isSocketReady || !gameId) return;
            sendJson({ type: "promote-host", gameId, targetPlayerName: playerName });
        },
        [isSocketReady, gameId, sendJson]
    );

    const onToggleLock = useCallback(
        (boardType: LobbyBoardType, index: number) => {
            if (!isSocketReady || !gameId) return;
            sendJson({ type: "toggle-lock-category", gameId, boardType, index });
        },
        [isSocketReady, gameId, sendJson]
    );

    const onChangeCategory = useCallback(
        (boardType: LobbyBoardType, index: number, value: string) => {
            setCategories((prev) => {
                const updatedBoard = [...(prev[boardType] ?? [])];
                if (index >= 0 && index < updatedBoard.length) updatedBoard[index] = value;

                const updated = { ...prev, [boardType]: updatedBoard };

                if (isSocketReady && gameId) {
                    sendJson({ type: "update-category", gameId, boardType, index, value });
                }

                return updated;
            });
        },
        [isSocketReady, gameId, sendJson]
    );

    const requestLobbyState = useCallback(() => {
        if (!isSocketReady || !gameId) return;
        sendJson({ type: "request-lobby-state", gameId, playerKey });
    }, [isSocketReady, gameId, playerKey, sendJson]);

    // --- join / request snapshot (moved from Lobby.tsx)

    useEffect(() => {
        if (!isSocketReady) return;
        if (!gameId) return;
        if (!effectivePlayerName) return;

        // Always attempt to (re)join when socket is ready; server dedupes via playerKey.
        sendJson({ type: "join-lobby", gameId, playerName: effectivePlayerName, playerKey });
        requestLobbyState();
    }, [isSocketReady, gameId, effectivePlayerName, playerKey, sendJson, requestLobbyState]);

    // --- inbound message handling (moved from Lobby.tsx)

    useEffect(() => {
        if (!isSocketReady) return;
        if (!gameId) return;

        setIsLoading(true);
        setLoadingMessage("Joining lobby...");

        const unsubscribe = subscribe((message) => {
            // console.log(message);

            switch (message.type) {
                case "player-list-update": {
                    const m = message as unknown as { players: Player[]; host: string };

                    const sortedPlayers = [...m.players].sort((a, b) => {
                        if (a.name === m.host) return -1;
                        if (b.name === m.host) return 1;
                        return 0;
                    });

                    setPlayers(sortedPlayers);
                    setHost(m.host);

                    const hostName = (m.host ?? "").trim();
                    const youName = (effectivePlayerName ?? "").trim();
                    setIsHostServer(hostName.length > 0 && youName.length > 0 && hostName === youName);
                    return;
                }

                case "lobby-state": {
                    const m = message as unknown as {
                        players: Player[];
                        host: string;
                        categories?: string[];
                        inLobby?: boolean;
                        isGenerating?: boolean;
                        lockedCategories?: LockedCategories;
                        you?: { isHost?: boolean; playerName?: string; playerKey?: string };
                    };

                    setPlayers(Array.isArray(m.players) ? m.players : []);
                    setHost(m.host ?? null);

                    const hostName = (m.host ?? "").trim();
                    const youName = (m.you?.playerName ?? "").trim();
                    setIsHostServer(Boolean(m.you?.isHost) || (hostName.length > 0 && youName.length > 0 && hostName === youName));

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

                    if (m.isGenerating) {
                        setIsLoading(true);
                        setLoadingMessage("Generating your questions...");
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

                case "trigger-loading": {
                    setIsLoading(true);
                    setLoadingMessage("Generating your questions...");
                    return;
                }

                case "create-board-failed": {
                    setIsLoading(false);

                    const m = message as unknown as { message?: string };

                    const alertContent = (
                        <span>
                            <span className="text-red-500 font-bold text-xl">Failed to start game</span>
                            <br />
                            <span>{m.message ?? "Unknown error."}</span>
                        </span>
                    );


                    showAlert(alertContent, [
                        {
                            label: "Okay",
                            actionValue: "okay",
                            styleClass: "bg-green-500 text-white hover:bg-green-600",
                        },
                    ]);

                    return;
                }


                case "start-game": {
                    setIsLoading(false);
                    setAllowLeave(true);
                    return;
                }

                case "check-lobby-response": {
                    const m = message as unknown as { isValid: boolean };

                    if (!m.isValid) {
                        // Lobby no longer exists or already started.
                        // If we have an identity, we should enter the game page and let game rehydrate from server.
                        if (effectivePlayerName) {
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
    }, [
        isSocketReady,
        gameId,
        subscribe,
        sendJson,
        effectivePlayerName,
        showAlert,
        requestLobbyState,
    ]);

    return {
        // socket state
        isSocketReady,

        // snapshot + derived
        isLoading,
        setManualLoading,
        clearLoading,
        loadingMessage,
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
    };
}

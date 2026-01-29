import React, {useEffect, useMemo, useState} from 'react';
import { useLocation, useNavigate, useParams} from "react-router-dom";
import { useWebSocket } from "../contexts/WebSocketContext.tsx";
import LobbySidebar from "../components/lobby/LobbySidebar.tsx";
import LoadingScreen from "../components/common/LoadingScreen.tsx";
import HostControls from "../components/lobby/HostControls.tsx";
import CategoryBoard, { LobbyBoardType } from "../components/lobby/CategoryBoard.tsx";
import {Player} from "../types/Lobby.ts";
import {useProfile} from "../contexts/ProfileContext.tsx";
import {useAlert} from "../contexts/AlertContext.tsx";
import { motion } from 'framer-motion';
import {getUniqueCategories} from "../categories/getUniqueCategories.ts";
import {useGameSession} from "../hooks/useGameSession.ts";

type LockedCategories = {
    firstBoard: boolean[]; // Jeopardy lock states
    secondBoard: boolean[]; // Double Jeopardy lock states
    finalJeopardy: boolean[];
};

type CategorySection = typeof CATEGORY_SECTIONS[number];
type BoardType = CategorySection["key"];

const CATEGORY_SECTIONS = [
    { key: "firstBoard", title: "Jeopardy!", count: 5 },
    { key: "secondBoard", title: "Double Jeopardy!", count: 5 },
    { key: "finalJeopardy", title: "Final Jeopardy!", count: 1 },
] as const;

function buildInitial<T>(
    make: (count: number) => T
): Record<BoardType, T> {
    return CATEGORY_SECTIONS.reduce<Record<BoardType, T>>(
        (acc, section) => {
            acc[section.key] = make(section.count);
            return acc;
        },
        {} as Record<BoardType, T>
    );
}


function flattenBySections(values: Record<BoardType, string[]>): string[] {
    return CATEGORY_SECTIONS.flatMap((s) => (values[s.key] ?? []).slice(0, s.count));
}

function unflattenBySections(flat: string[]): Record<BoardType, string[]> {
    let cursor = 0;
    const out = {} as Record<BoardType, string[]>;
    for (const s of CATEGORY_SECTIONS) {
        out[s.key] = flat.slice(cursor, cursor + s.count);
        cursor += s.count;
    }
    return out;
}

const Lobby: React.FC = () => {
    const location = useLocation();
    const [categories, setCategories] = useState<Record<BoardType, string[]>>(
        buildInitial((count) => Array(count).fill(""))
    );
    const { gameId } = useParams<{ gameId: string }>();
    const [isLoading, setIsLoading] = useState(false);
    const [allowLeave, setAllowLeave] = useState(false);
    const [loadingMessage, setLoadingMessage] = useState('');
    const [timeToBuzz, setTimeToBuzz] = useState(10);
    const [timeToAnswer, setTimeToAnswer] = useState(10);
    const [copySuccess, setCopySuccess] = useState(false);
    const [boardJson, setBoardJson] = useState<string>("");
    const [boardJsonError, setBoardJsonError] = useState<string | null>(null);
    // Server is authoritative for lobby membership + host.
    const [players, setPlayers] = useState<Player[]>([]);
    const [host, setHost] = useState<string | null>(null);
    const [isHostServer, setIsHostServer] = useState<boolean>(false);
    const [selectedModel, setSelectedModel] = useState('gpt-5-mini'); // Default value for dropdown
    const [includeVisuals, setIncludeVisuals] = useState(false);
    const [lockedCategories, setLockedCategories] = useState<LockedCategories>({
        firstBoard: Array(CATEGORY_SECTIONS[0].count).fill(false),
        secondBoard: Array(CATEGORY_SECTIONS[1].count).fill(false),
        finalJeopardy: Array(CATEGORY_SECTIONS[2].count).fill(false),
    });

    const { isSocketReady, sendJson, subscribe } = useWebSocket();
    const navigate = useNavigate();
    const { profile } = useProfile();
    const { showAlert } = useAlert();
    const { session, saveSession } = useGameSession();

    // Stable identity key (persists across refresh/reconnect) so the server can dedupe players.
    const playerKey = useMemo(() => {
        if (!gameId) return null;
        const storageKey = `aj_playerKey_${gameId}`;
        const existing = localStorage.getItem(storageKey);
        if (existing && existing.trim()) return existing;
        // Use crypto.randomUUID when available; fallback is fine for local-only identity.
        const created = (globalThis.crypto && "randomUUID" in globalThis.crypto)
            ? (globalThis.crypto as Crypto).randomUUID()
            : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
        localStorage.setItem(storageKey, created);
        return created;
    }, [gameId]);

    const effectivePlayerName = useMemo(() => {
        if (location.state?.playerName) return location.state.playerName;
        if (session?.gameId === gameId && session?.playerName) return session.playerName;
        if (profile?.displayname) return profile.displayname;
        return null;
    }, [location.state, session, gameId, profile]);
    // Do NOT trust location.state for host permissions; server will confirm via lobby-state.
    const isHost = isHostServer;

    const onPromoteHost = (playerName: string) => {
        if (!isSocketReady) return;
        if (!gameId) return;
        sendJson({ type: "promote-host", gameId, targetPlayerName: playerName });
    };

    useEffect(() => {
        if (!gameId || !effectivePlayerName) return;

        const shouldUpdate =
            session?.gameId !== gameId ||
            session?.playerName !== effectivePlayerName ||
            session?.isHost !== Boolean(isHost);

        if (!shouldUpdate) return;

        saveSession(gameId, effectivePlayerName, Boolean(isHost));
    }, [gameId, effectivePlayerName, isHost, session?.gameId, session?.playerName, session?.isHost, saveSession]);

    useEffect(() => {
        if (!isSocketReady) return;
        if (!gameId) return;
        if (!effectivePlayerName) return;

        // Always attempt to (re)join when the socket is ready; server dedupes via playerKey.
        sendJson({ type: "join-lobby", gameId, playerName: effectivePlayerName, playerKey });
        sendJson({ type: "request-lobby-state", gameId, playerKey });
    }, [isSocketReady, gameId, effectivePlayerName, playerKey, sendJson]);

    useEffect(() => {
        if (!allowLeave) return;
        if (!isSocketReady) return;
        if (!gameId) return;

        navigate(`/game/${gameId}`, {
            state: {
                playerName: effectivePlayerName,
                isHost,
                host,
            },
        });
    }, [allowLeave, isSocketReady, gameId, isHost, host, sendJson, navigate, effectivePlayerName, playerKey]);

    useEffect(() => {
        if (!isSocketReady) return;

        setIsLoading(true);
        setLoadingMessage("Joining lobby...");

        const unsubscribe = subscribe((message) => {
            console.log(message);

            switch (message.type) {
                case "player-list-update": {
                    const m = message as unknown as {
                        players: Player[];
                        host: string;
                    };

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
                        lockedCategories?: {
                            firstBoard: boolean[];
                            secondBoard: boolean[];
                            finalJeopardy: boolean[];
                        };
                        you?: {
                            isHost?: boolean;
                            playerName?: string;
                            playerKey?: string;
                        };
                    };

                    // Treat lobby-state as a snapshot: replace, don't merge.
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
                    const m = message as unknown as {
                        boardType: unknown;
                        index: number;
                        locked: boolean;
                    };

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
                        if (m.index >= 0 && m.index < nextBoard.length) {
                            nextBoard[m.index] = m.value ?? "";
                        }
                        return { ...prev, [m.boardType]: nextBoard };
                    });

                    return;
                }
                case "categories-updated": {
                    const m = message as unknown as { categories: string[] };

                    if (Array.isArray(m.categories)) {
                        setCategories(unflattenBySections(m.categories));
                    }
                    return;
                }

                case "trigger-loading": {
                    setIsLoading(true);
                    setLoadingMessage("Generating your questions");
                    return;
                }

                case "create-board-failed": {
                    setIsLoading(false);
                    const m = message as unknown as { message?: string };
                    showAlert(
                        <span>
                            <span className="text-red-500 font-bold text-xl">Failed to start game</span><br/>
                            <span>{m.message ?? "Unknown error."}</span>
                        </span>,
                        [
                            {
                                label: "Okay",
                                actionValue: "okay",
                                styleClass: "bg-green-500 text-white hover:bg-green-600",
                            }
                        ]
                    );
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
                        // Lobby no longer exists (or already started). If we have an identity, attempt to join the game.
                        if (effectivePlayerName) {
                            setIsLoading(true);
                            setLoadingMessage("Game already started. Joining game...");
                            setAllowLeave(true);
                            return;
                        }

                        navigate("/");
                        return;
                    }

                    setLoadingMessage("Syncing lobby state...");
                    sendJson({ type: "request-lobby-state", gameId, playerKey });
                    return;
                }

                case "error": {
                    // ...log it...
                    if (gameId) sendJson({ type: "request-lobby-state", gameId, playerKey });
                    return;
                }

                default:
                    return;
            }
        });

        sendJson({ type: "check-lobby", gameId });

        return unsubscribe;
    }, [isSocketReady, subscribe, sendJson, gameId, navigate, effectivePlayerName, playerKey, showAlert]);

    const onToggleLock = (boardType: LobbyBoardType, index: number) => {
        if (!isSocketReady) return;
        if (!gameId) return;

        sendJson({
            type: "toggle-lock-category",
            gameId,
            boardType,
            index
        });
    };

    const handleDropdownChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
        setSelectedModel(e.target.value);
    };

    const onChangeCategory = (boardType: LobbyBoardType, index: number, value: string) => {
        setCategories((prev) => {
            const updatedBoard = [...(prev[boardType] ?? [])];
            if (index >= 0 && index < updatedBoard.length) updatedBoard[index] = value;

            const updated = { ...prev, [boardType]: updatedBoard };

            if (isSocketReady && gameId) {
                sendJson({
                    type: "update-category",
                    gameId,
                    boardType,
                    index,
                    value,
                });
            }

            return updated;
        });
    };

    const handleRandomizeCategory = (boardType: LobbyBoardType, index: number) => {
        if (!isSocketReady) return;
        if (!gameId) return;

        const candidates = getUniqueCategories(25);

        sendJson({
            type: "randomize-category",
            gameId,
            boardType,
            index,
            candidates,
        });
    };

    function isObject(value: unknown): value is Record<string, unknown> {
        return typeof value === "object" && value !== null;
    }

    const tryValidateBoardJson = (raw: string): string | null => {
        if (!raw.trim()) return null; // empty means "use AI"

        try {
            const parsed: unknown = JSON.parse(raw);

            if (!isObject(parsed)) {
                return "Board JSON must be an object.";
            }

            // Accept either:
            // { firstBoard, secondBoard, finalJeopardy }
            // OR
            // { boardData: { firstBoard, secondBoard, finalJeopardy } }
            const boardData = isObject(parsed.boardData)
                ? parsed.boardData
                : parsed;

            if (
                !("firstBoard" in boardData) ||
                !("secondBoard" in boardData) ||
                !("finalJeopardy" in boardData)
            ) {
                return "Missing firstBoard / secondBoard / finalJeopardy.";
            }

            return null;
        } catch {
            return "Invalid JSON (can’t parse).";
        }
    };


    const handleCreateGame = async () => {
        if (!profile) {
            await showAlert(
                <span>
                    <span className="text-red-500 font-bold text-xl">You need to be logged in to do this.</span><br/>
                </span>,
                [
                    {
                        label: "Okay",
                        actionValue: "okay",
                        styleClass: "bg-green-500 text-white hover:bg-green-600",
                    }]
            );
            return;
        }

        const localJsonError = tryValidateBoardJson(boardJson);
        setBoardJsonError(localJsonError);

        const usingImportedBoard = boardJson.trim().length > 0;

        if (usingImportedBoard && localJsonError) {
            await showAlert(
                <span>
                    <span className="text-red-500 font-bold text-xl">Invalid board JSON</span><br/>
                    <span>{localJsonError}</span>
                </span>,
                [
                    {
                        label: "Okay",
                        actionValue: "okay",
                        styleClass: "bg-green-500 text-white hover:bg-green-600",
                    }
                ]
            );
            return;
        }

        // Only require categories when NOT importing
        if (!usingImportedBoard) {
            if (
                categories.firstBoard.some((c) => !c.trim()) ||
                categories.secondBoard.some((c) => !c.trim())
            ) {
                await showAlert(
                    <span>
                        <span className="text-red-500 font-bold text-xl">Please fill in all the categories</span><br/>
                    </span>,
                    [
                        {
                            label: "Okay",
                            actionValue: "okay",
                            styleClass: "bg-green-500 text-white hover:bg-green-600",
                        }]
                );
                return;
            }
        }

        try {
            setIsLoading(true);
            setLoadingMessage('Generating your questions');

            if (!isSocketReady) return;
            if (!gameId) return;

            sendJson({
                type: "create-game",
                gameId,
                playerKey,
                host: profile.displayname,
                timeToBuzz,
                timeToAnswer,
                categories: flattenBySections(categories),
                selectedModel: usingImportedBoard ? undefined : selectedModel,
                boardJson: boardJson.trim() ? boardJson : undefined,
                includeVisuals,
            });
        } catch (error) {
            console.error('Failed to generate board data:', error);
            alert('Failed to generate board data. Please try again.');
        }
    };

    return isLoading ? (
        <LoadingScreen message={loadingMessage}/>
    ) : (
        <div className="min-h-[calc(100vh-5.5rem)] bg-gradient-to-r from-indigo-400 to-blue-700 p-6">
            <div className="bg-white rounded-xl shadow-2xl overflow-hidden w-full max-w-6xl mx-auto">
                <div className="grid grid-cols-1 lg:grid-cols-4">
                    {/* Sidebar Column */}
                    <div className="lg:col-span-1 border-r border-gray-200 bg-gray-50 p-6">
                        <LobbySidebar
                            gameId={gameId}
                            host={host}
                            players={players}
                            copySuccess={copySuccess}
                            setCopySuccess={setCopySuccess}
                            isHost={isHost}
                            onPromoteHost={onPromoteHost}
                        />
                    </div>

                    {/* Main Content Column */}
                    <div className="lg:col-span-3 p-8">
                        {/* Category Boards */}
                        <div className="space-y-8">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 ">
                                <div className="min-w-0">
                                    <CategoryBoard
                                        title="Jeopardy!"
                                        categories={categories.firstBoard}
                                        isHost={isHost}
                                        lockedCategories={lockedCategories.firstBoard}
                                        boardType="firstBoard"
                                        onChangeCategory={onChangeCategory}
                                        onRandomizeCategory={handleRandomizeCategory}
                                        onToggleLock={onToggleLock}
                                    />
                                </div>
                                <div className="min-w-0">
                                    <CategoryBoard
                                        title="Double Jeopardy!"
                                        categories={categories.secondBoard}
                                        isHost={isHost}
                                        lockedCategories={lockedCategories.secondBoard}
                                        boardType="secondBoard"
                                        onChangeCategory={onChangeCategory}
                                        onRandomizeCategory={handleRandomizeCategory}
                                        onToggleLock={onToggleLock}
                                    />
                                </div>
                            </div>

                            <CategoryBoard
                                title="Final Jeopardy!"
                                categories={categories.finalJeopardy}
                                isHost={isHost}
                                lockedCategories={lockedCategories.finalJeopardy}
                                boardType="finalJeopardy"
                                onChangeCategory={onChangeCategory}
                                onRandomizeCategory={handleRandomizeCategory}
                                onToggleLock={onToggleLock}
                            />
                        </div>

                        {/* Host Controls */}
                        {isHost && (
                            <motion.div
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                className="mt-8"
                            >
                                <HostControls
                                    selectedModel={selectedModel}
                                    onModelChange={handleDropdownChange}
                                    onCreateGame={handleCreateGame}
                                    timeToBuzz={timeToBuzz}
                                    setTimeToBuzz={setTimeToBuzz}
                                    timeToAnswer={timeToAnswer}
                                    setTimeToAnswer={setTimeToAnswer}
                                    isSoloLobby={players.length <= 1}
                                    boardJson={boardJson}
                                    setBoardJson={setBoardJson}
                                    boardJsonError={boardJsonError}
                                    setBoardJsonError={setBoardJsonError}
                                    tryValidateBoardJson={tryValidateBoardJson}
                                    includeVisuals={includeVisuals}
                                    setIncludeVisuals={setIncludeVisuals}
                                />
                            </motion.div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};

export default Lobby;

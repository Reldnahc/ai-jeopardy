import React, {useEffect, useMemo, useRef, useState} from 'react';
import { useLocation, useNavigate, useParams} from "react-router-dom";
import { useWebSocket } from "../contexts/WebSocketContext.tsx";
import LobbySidebar from "../components/lobby/LobbySidebar.tsx";
import LoadingScreen from "../components/common/LoadingScreen.tsx";
import HostControls from "../components/lobby/HostControls.tsx";
import FinalJeopardyCategory from "../components/lobby/FinalJeopardyCategory.tsx";
import CategoryBoard from "../components/lobby/CategoryBoard.tsx";
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

//type BoardType = 'firstBoard' | 'secondBoard';

const Lobby: React.FC = () => {
    const location = useLocation();
    const [categories, setCategories] = useState<{
        firstBoard: string[];
        secondBoard: string[];
        finalJeopardy: string;
    }>({
        firstBoard: ['', '', '', '', ''],
        secondBoard: ['', '', '', '', ''],
        finalJeopardy: '',
    });
    const { gameId } = useParams<{ gameId: string }>();
    const [isLoading, setIsLoading] = useState(false);
    const [allowLeave, setAllowLeave] = useState(false);
    const [loadingMessage, setLoadingMessage] = useState('');
    const [timeToBuzz, setTimeToBuzz] = useState(10);
    const [timeToAnswer, setTimeToAnswer] = useState(10);
    const [copySuccess, setCopySuccess] = useState(false);
    const [boardJson, setBoardJson] = useState<string>("");
    const [boardJsonError, setBoardJsonError] = useState<string | null>(null);
    const [players, setPlayers] = useState<Player[]>(location.state?.players || []);
    const [host, setHost] = useState<string | null>(null);
    const [selectedModel, setSelectedModel] = useState('gpt-5-mini'); // Default value for dropdown
    const [includeVisuals, setIncludeVisuals] = useState(false);
    const [lockedCategories, setLockedCategories] = useState<LockedCategories>({
        firstBoard: Array(5).fill(false), // Default unlocked
        secondBoard: Array(5).fill(false), // Default unlocked
        finalJeopardy: Array(1).fill(false),
    });

    const { isSocketReady, sendJson, subscribe } = useWebSocket();
    const navigate = useNavigate();
    const { profile } = useProfile();
    const { showAlert } = useAlert();
    const { session, saveSession } = useGameSession();

    const joinedLobbyRef = useRef<string | null>(null);

    const effectivePlayerName = useMemo(() => {
        if (location.state?.playerName) return location.state.playerName;
        if (session?.gameId === gameId && session?.playerName) return session.playerName;
        if (profile?.displayname) return profile.displayname;
        return null;
    }, [location.state, session, gameId, profile]);
    const isHost = location.state?.isHost || (session?.gameId === gameId && session?.isHost) || false;

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

        if (joinedLobbyRef.current === gameId) return;
        joinedLobbyRef.current = gameId;

        sendJson({ type: "join-lobby", gameId, playerName: effectivePlayerName });
        sendJson({ type: "request-lobby-state", gameId });
    }, [isSocketReady, gameId, effectivePlayerName, sendJson]);


    useEffect(() => {
        if (!allowLeave) return;
        if (!isSocketReady) return;
        if (!gameId) return;

        sendJson({
            type: "join-game",
            gameId,
            playerName: effectivePlayerName,
        });

        navigate(`/game/${gameId}`, {
            state: {
                playerName: effectivePlayerName,
                isHost,
                host,
            },
        });
    }, [allowLeave, isSocketReady, gameId, isHost, host, sendJson, navigate, effectivePlayerName]);

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
                    };

                    setPlayers(m.players);
                    setHost(m.host);

                    if (Array.isArray(m.categories)) {
                        setCategories({
                            firstBoard: m.categories.slice(0, 5),
                            secondBoard: m.categories.slice(5, 10),
                            finalJeopardy: m.categories[10] ?? "",
                        });
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

                    if (m.inLobby === false && profile?.displayname) {
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
                        if (m.boardType === "finalJeopardy") {
                            return { ...prev, finalJeopardy: m.value ?? "" };
                        }

                        const nextBoard = [...prev[m.boardType]];
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
                        setCategories({
                            firstBoard: m.categories.slice(0, 5),
                            secondBoard: m.categories.slice(5, 10),
                            finalJeopardy: m.categories[10] ?? "",
                        });
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
                        if (profile?.displayname) {
                            setIsLoading(true);
                            setLoadingMessage("Game already started. Joining game...");
                            setAllowLeave(true);
                            return;
                        }

                        navigate("/");
                        return;
                    }

                    setLoadingMessage("Syncing lobby state...");
                    sendJson({ type: "request-lobby-state", gameId });
                    return;
                }

                default:
                    return;
            }
        });

        sendJson({ type: "check-lobby", gameId });

        return unsubscribe;
    }, [isSocketReady, subscribe, sendJson, gameId, navigate, profile]);


    const onToggleLock = (
        boardType: "firstBoard" | "secondBoard" | "finalJeopardy",
        index: number
    ) => {
        if (!isSocketReady) return;
        if (!gameId) return;

        sendJson({
            type: "toggle-lock-category",
            gameId,
            boardType,
            index,
            locked: !lockedCategories[boardType][index],
        });
    };


    const handleDropdownChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
        setSelectedModel(e.target.value);
    };

    const onChangeCategory = (
        boardType: "firstBoard" | "secondBoard" | "finalJeopardy",
        index: number | undefined,
        value: string
    ) => {
        setCategories((prev) => {
            if (boardType === "finalJeopardy") {
                const updated = { ...prev, finalJeopardy: value };

                if (isSocketReady && gameId) {
                    sendJson({
                        type: "update-category",
                        gameId,
                        boardType: "finalJeopardy",
                        index: 0,
                        value,
                    });
                }

                return updated;
            }

            const updatedBoard = [...prev[boardType]];
            if (index !== undefined) updatedBoard[index] = value;

            const updated = { ...prev, [boardType]: updatedBoard };

            if (isSocketReady && gameId && index !== undefined) {
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

    const handleRandomizeCategory = (
        boardType: 'firstBoard' | 'secondBoard' | 'finalJeopardy',
        index?: number
    ) => {
        setCategories((prev) => {
            const updatedCategories = { ...prev };

            if (boardType === 'finalJeopardy') {
                let newCategory;
                do {
                    newCategory = getUniqueCategories(1)[0];
                } while (
                    prev.firstBoard.includes(newCategory) ||
                    prev.secondBoard.includes(newCategory) ||
                    prev.finalJeopardy === newCategory
                    );
                updatedCategories.finalJeopardy = newCategory;
            } else if (index !== undefined) {
                const board = [...updatedCategories[boardType]];
                let newCategory;
                do {
                    newCategory = getUniqueCategories(1)[0];
                } while (
                    board.includes(newCategory) ||
                    prev.firstBoard.includes(newCategory) ||
                    prev.secondBoard.includes(newCategory)
                    );
                board[index] = newCategory;
                updatedCategories[boardType] = board;
            }

            if (isSocketReady && gameId) {
                if (boardType === "finalJeopardy") {
                    sendJson({
                        type: "update-category",
                        gameId,
                        boardType: "finalJeopardy",
                        index: 0,
                        value: updatedCategories.finalJeopardy,
                    });
                } else if (index !== undefined) {
                    sendJson({
                        type: "update-category",
                        gameId,
                        boardType,
                        index,
                        value: updatedCategories[boardType][index],
                    });
                }
            }
            return updatedCategories;
        });
    };

    const tryValidateBoardJson = (raw: string): string | null => {
        if (!raw.trim()) return null; // empty means "use AI"

        try {
            const parsed = JSON.parse(raw) as unknown;

            // We only do minimal checks here because server is authoritative.
            if (typeof parsed !== "object" || parsed === null) return "Board JSON must be an object.";

            const p = parsed as any;
            const bd = p.boardData && typeof p.boardData === "object" ? p.boardData : p;

            if (!bd.firstBoard || !bd.secondBoard || !bd.finalJeopardy) {
                return "Missing firstBoard / secondBoard / finalJeopardy.";
            }

            return null;
        } catch {
            return "Invalid JSON (can’t parse).";
        }
    };

    const handleCreateGame = async () => {
        if (!profile) {
            showAlert(
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
            showAlert(
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
                showAlert(
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
                host: profile.displayname,
                timeToBuzz,
                timeToAnswer,
                categories: [...categories.firstBoard, ...categories.secondBoard, categories.finalJeopardy],
                selectedModel,
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

                            <FinalJeopardyCategory
                                category={categories.finalJeopardy}
                                isHost={isHost}
                                onChangeCategory={onChangeCategory}
                                onRandomizeCategory={handleRandomizeCategory}
                                lockedCategories={lockedCategories.finalJeopardy}
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

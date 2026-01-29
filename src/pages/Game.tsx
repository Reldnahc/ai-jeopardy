import {useCallback, useEffect, useRef, useState} from 'react';
import {useLocation, useNavigate, useParams} from 'react-router-dom';
import JeopardyBoard from '../components/game/JeopardyBoard.tsx';
import {Category, Clue} from "../types.ts";
import Sidebar from "../components/game/Sidebar.tsx";
import {DrawingPath} from "../utils/drawingUtils.tsx";
import FinalScoreScreen from "../components/game/FinalScoreScreen.tsx";
import {useWebSocket} from "../contexts/WebSocketContext.tsx";
import {Player} from "../types/Lobby.ts";
import {useDeviceContext} from "../contexts/DeviceContext.tsx";
import MobileSidebar from "../components/game/MobileSidebar.tsx";
import {useGameSession} from "../hooks/useGameSession.ts";

type BoardData = {
    firstBoard: { categories: Category[] };
    secondBoard: { categories: Category[] };
    finalJeopardy: { categories: Category[] };
};

type SelectedClueFromServer = Clue & { isAnswerRevealed?: boolean };


export default function Game() {
    const {gameId} = useParams<{ gameId: string }>();
    const location = useLocation();
    const navigate = useNavigate();
    const { session, saveSession, clearSession  } = useGameSession();
    const playerName = location.state?.playerName || '';
    const [host, setHost] = useState<string | null>(null);
    const [players, setPlayers] = useState<Player[]>(location.state?.players || []);
    const [buzzResult, setBuzzResult] = useState<string | null>(null);
    const [selectedClue, setSelectedClue] = useState<Clue | null>(null);
    const [clearedClues, setClearedClues] = useState<Set<string>>(new Set());
    const [buzzerLocked, setBuzzerLocked] = useState(true);
    const [activeBoard, setActiveBoard] = useState<'firstBoard' | 'secondBoard' | 'finalJeopardy'>('firstBoard');
    const [scores, setScores] = useState<Record<string, number>>({});
    const [buzzLockedOut, setBuzzLockedOut] = useState(false);//early buzz
    const [lastQuestionValue, setLastQuestionValue] = useState<number>(100);
    const [allWagersSubmitted, setAllWagersSubmitted] = useState(false);
    const [isFinalJeopardy, setIsFinalJeopardy] = useState(false);
    const [drawings, setDrawings] = useState<Record<string, DrawingPath[]> | null>(null);
    const [wagers, setWagers] = useState<Record<string, number>>({});
    const [timerEndTime, setTimerEndTime] = useState<number | null>(null);
    const [timerDuration, setTimerDuration] = useState<number>(-1); // default value
    const timerVersionRef = useRef<number>(0);

    const resetLocalTimerState = useCallback(() => {
        setTimerEndTime(null);
        setTimerDuration(0);
    }, []);

    const [isGameOver, setIsGameOver] = useState(false); // New state to track if Final Jeopardy is finished
    const [boardData, setBoardData] = useState<BoardData>({
        firstBoard: { categories: [{ category: '', values: [] }] },
        secondBoard: { categories: [{ category: '', values: [] }] },
        finalJeopardy: { categories: [{ category: '', values: [] }] },
    });

    // Persistent WebSocket connection
    const { isSocketReady, sendJson, subscribe } = useWebSocket();
    const { deviceType } = useDeviceContext();

    const boardDataRef = useRef(boardData);

    const effectivePlayerName = location.state?.playerName ||
        (session?.gameId === gameId ? session?.playerName : '') ||
        '';
    const isHost = Boolean(host && effectivePlayerName && host.trim() === effectivePlayerName.trim());

    const handleScoreUpdate = (player: string, delta: number) => {
        if (!gameId) return;

        // Final Jeopardy: host buttons mean +wager / -wager, not +/- lastQuestionValue.
        if (isFinalJeopardy && allWagersSubmitted) {
            const w = Math.abs(wagers[player] ?? 0);
            delta = delta < 0 ? -w : w;
        }

        // Server-authoritative:
        sendJson({ type: "update-score", gameId, player, delta });
    };

    const leaveGame = useCallback(() => {
        if (!gameId || !effectivePlayerName) {
            clearSession();
            navigate("/");
            return;
        }

        if (isSocketReady) {
            sendJson({
                type: "leave-game",
                gameId,
                playerName: effectivePlayerName,
            });
        }

        clearSession();
        navigate("/");
    }, [gameId, effectivePlayerName, isSocketReady, sendJson, clearSession, navigate]);


    useEffect(() => {
        if (!gameId || !effectivePlayerName) return;

        // Only write if different
        if (
            session?.gameId === gameId &&
            session?.playerName === effectivePlayerName &&
            session?.isHost === isHost
        ) {
            return;
        }

        saveSession(gameId, effectivePlayerName, isHost);
    }, [gameId, effectivePlayerName, isHost, saveSession, session]);


    useEffect(() => {
        if (!isSocketReady) return;
        if (!gameId || !effectivePlayerName) return;

        // Whether it's a fresh join or a reconnect, we send "join-game".
        // The server now handles the difference.
        sendJson({
            type: "join-game",
            gameId,
            playerName: effectivePlayerName,
        });

    }, [gameId, effectivePlayerName, sendJson, isSocketReady]);

    useEffect(() => {
        boardDataRef.current = boardData;
    }, [boardData]);

    const markAllCluesComplete = () => {
        if (!gameId) return;
        sendJson({ type: "mark-all-complete", gameId });
    };

    const handleBuzz = () => {
        if (buzzResult || buzzLockedOut) return; // Prevent buzzing if temporarily locked out
        if (buzzerLocked) {
            setBuzzLockedOut(true); // Temporarily lock out the player

            // Unlock the player after 5 seconds
            setTimeout(() => {
                setBuzzLockedOut(false); // Reset lockout state
            }, 1000);

            return;
        }
        if (!gameId) return;
        sendJson({ type: "buzz", gameId, effectivePlayerName });
    };

    const onClueSelected = useCallback((clue: Clue) => {
        if (isHost && clue) {
            if (!gameId) return;
            sendJson({ type: "clue-selected", gameId, clue });
            if (clue.value !== undefined) {
                setLastQuestionValue(clue.value); // Set last question value based on clue's value
            }
        }
    },[isHost, gameId, sendJson]);

    function preloadImages(urls: string[]) {
        urls.forEach((url) => {
            const img = new Image();
            img.src = url;
        });
    }

    useEffect(() => {
        const urls: string[] = [];

        const collect = (categories?: Category[]) => {
            categories?.forEach((cat) =>
                cat.values.forEach((clue) => {
                    if (clue.media?.type === "image") {
                        urls.push(`/api/images/${clue.media.assetId}`);
                    }
                })
            );
        };

        collect(boardData.firstBoard.categories);
        collect(boardData.secondBoard.categories);
        collect(boardData.finalJeopardy.categories);

        preloadImages(urls);
    }, [boardData]);

    useEffect(() => {
        if (!isSocketReady) return;

        const unsubscribe = subscribe((message) => {
            // message is already parsed JSON with a string `type`
            console.log(message);

            if (message.type === "game-state") {
                const m = message as unknown as {
                    players: Player[];
                    host: string;
                    buzzResult?: string | null;
                    boardData: BoardData;
                    scores?: Record<string, number>;
                    clearedClues?: string[];
                    selectedClue?: SelectedClueFromServer;
                    activeBoard?: "firstBoard" | "secondBoard" | "finalJeopardy";
                    isFinalJeopardy?: boolean;
                    finalJeopardyStage?: string | null;
                    wagers?: Record<string, number>;
                    timerEndTime?: number | null;
                    timerDuration?: number | null;
                    timerVersion?: number;
                };


                setPlayers(m.players);
                setHost(m.host);
                setBuzzResult(m.buzzResult ? m.buzzResult : null);
                setBoardData(m.boardData);
                setScores(m.scores || {});

                if (Array.isArray(m.clearedClues)) {
                    setClearedClues(new Set(m.clearedClues));
                }

                if (m.activeBoard) setActiveBoard(m.activeBoard);

                const fj = m.activeBoard === "finalJeopardy" || m.isFinalJeopardy;
                setIsFinalJeopardy(Boolean(fj));
                if (fj) {
                    setWagers(m.wagers || {});
                    setAllWagersSubmitted(m.finalJeopardyStage !== "wager");
                }

                if (m.selectedClue) {
                    setSelectedClue({ ...m.selectedClue, showAnswer: m.selectedClue.isAnswerRevealed || false });
                } else {
                    setSelectedClue(null); // <-- important
                }

                // Hydrate active timer (server-authoritative)
                if (typeof m.timerVersion === "number") {
                    timerVersionRef.current = m.timerVersion;
                }
                if (typeof m.timerEndTime === "number" && m.timerEndTime > Date.now()) {
                    setTimerEndTime(m.timerEndTime);
                    setTimerDuration(typeof m.timerDuration === "number" ? m.timerDuration : 0);
                } else {
                    resetLocalTimerState();
                }
                return;
            }

            if (message.type === "final-jeopardy") {
                setActiveBoard("finalJeopardy");

                setIsFinalJeopardy(true);

                setAllWagersSubmitted(false);
                setWagers({});

                setSelectedClue(null);
                setBuzzResult(null);
                resetLocalTimerState();
                return;
            }

            if (message.type === "cleared-clues-sync") {
                const m = message as { type: "cleared-clues-sync"; clearedClues: string[] };
                setClearedClues(new Set(m.clearedClues ?? []));
                return;
            }


            if (message.type === "all-wagers-submitted") {
                const m = message as unknown as { wagers: Record<string, number> };
                setAllWagersSubmitted(true);
                setWagers(m.wagers);

                const finalClue = boardDataRef.current.finalJeopardy?.categories?.[0]?.values?.[0];
                if (finalClue) onClueSelected(finalClue);
                return;
            }

            if (message.type === "player-list-update") {
                const m = message as unknown as { players: Player[]; host: string };
                const sortedPlayers = [...m.players].sort((a, b) => {
                    if (a.name === m.host) return -1;
                    if (b.name === m.host) return 1;
                    return 0;
                });
                setPlayers(sortedPlayers);
                setHost(m.host);
                return;
            }

            if (message.type === "buzz-result") {
                const m = message as unknown as { playerName: string };
                setBuzzResult(m.playerName);
                resetLocalTimerState();
                return;
            }

            if (message.type === "buzzer-locked") {
                setBuzzerLocked(true);
                return;
            }

            if (message.type === "buzzer-unlocked") {
                setBuzzerLocked(false);
                return;
            }

            if (message.type === "reset-buzzer") {
                setBuzzResult(null);
                setBuzzerLocked(true);

                resetLocalTimerState();
                return;
            }

            if (message.type === "clue-selected") {
                const m = message as unknown as { clue: SelectedClueFromServer; clearedClues?: string[] };
                setSelectedClue({ ...m.clue, showAnswer: Boolean(m.clue.isAnswerRevealed) });
                if (m.clearedClues) setClearedClues(new Set(m.clearedClues));
                return;
            }


            if (message.type === "timer-start") {
                const m = message as unknown as { endTime: number; duration: number; timerVersion: number; timerKind?: string | null };
                timerVersionRef.current = m.timerVersion;
                setTimerEndTime(m.endTime);
                setTimerDuration(m.duration);
                return;
            }

            if (message.type === "timer-end") {
                const m = message as unknown as { timerVersion: number };
                if (m.timerVersion === timerVersionRef.current) {
                    resetLocalTimerState();
                }
                return;
            }

            if (message.type === "answer-revealed") {
                const m = message as unknown as { clue?: SelectedClueFromServer };
                if (m.clue) setSelectedClue({ ...m.clue, showAnswer: true });
                resetLocalTimerState();
                return;
            }


            if (message.type === "all-clues-cleared") {
                const m = message as unknown as { clearedClues?: string[] };
                if (Array.isArray(m.clearedClues)) setClearedClues(new Set(m.clearedClues));
                return;
            }

            if (message.type === "clue-cleared") {
                const m = message as unknown as { clueId: string };
                setClearedClues((prev) => new Set(prev).add(m.clueId));
                return;
            }

            if (message.type === "returned-to-board") {
                setSelectedClue(null);
                setBuzzResult(null);
                resetLocalTimerState();
                return;
            }

            if (message.type === "transition-to-second-board") {
                setActiveBoard("secondBoard");
                setIsFinalJeopardy(false);
                setAllWagersSubmitted(false);
                setWagers({});

                return;
            }

            if (message.type === "update-scores") {
                const m = message as unknown as { scores: Record<string, number> };
                setScores(m.scores);
                return;
            }

            if (message.type === "all-final-jeopardy-drawings-submitted") {
                const m = message as unknown as { drawings: Record<string, DrawingPath[]> };
                setDrawings(m.drawings);
                return;
            }

            if (message.type === "game-over") {
                setIsGameOver(true);
                return;
            }
        });

        return unsubscribe;
    }, [isSocketReady, subscribe, onClueSelected, resetLocalTimerState]);

    if (!boardData) {
        return <p>Loading board... Please wait!</p>; // Display a loading message
    }

    return (
        <div
            className="flex h-screen w-screen overflow-hidden font-sans bg-gradient-to-r from-indigo-400 to-blue-700"
        >
            {/* Sidebar */}
            {deviceType === 'mobile' ? (
                <MobileSidebar
                    isHost={isHost}
                    host={host}
                    players={players}
                    scores={scores}
                    buzzResult={buzzResult}
                    lastQuestionValue={lastQuestionValue}
                    handleScoreUpdate={handleScoreUpdate}
                    onLeaveGame={leaveGame}
                />
            ) : (
                <Sidebar
                    isHost={isHost}
                    host={host}
                    players={players}
                    scores={scores}
                    buzzResult={buzzResult}
                    lastQuestionValue={lastQuestionValue}
                    activeBoard={activeBoard}
                    handleScoreUpdate={handleScoreUpdate}
                    markAllCluesComplete={markAllCluesComplete}
                    onLeaveGame={leaveGame}
                />
            )}
            {/* Jeopardy Board Section */}
            <div
                className="flex flex-1 justify-center items-center overflow-hidden p-0"
            >
                {isGameOver ? (
                    <FinalScoreScreen scores={scores} />
                ) : (
                    <>
                        {/* Jeopardy Board */}
                        <JeopardyBoard
                            boardData={boardData[activeBoard].categories}
                            isHost={isHost}
                            onClueSelected={onClueSelected}
                            selectedClue={selectedClue || null}
                            gameId={gameId || ''}
                            clearedClues={clearedClues}
                            players={players}
                            scores={scores}
                            currentPlayer={playerName}
                            allWagersSubmitted={allWagersSubmitted}
                            isFinalJeopardy={isFinalJeopardy}
                            drawings={drawings}
                            setBuzzerLocked={setBuzzerLocked}
                            setBuzzResult={setBuzzResult}
                            handleBuzz={handleBuzz}
                            buzzerLocked={buzzerLocked}
                            buzzResult={buzzResult}
                            buzzLockedOut={buzzLockedOut}
                            timerEndTime={timerEndTime}
                            timerDuration={timerDuration}
                        />
                    </>
                )}
            </div>
        </div>
    );
}

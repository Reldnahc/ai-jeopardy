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
    const [showAnswer, setShowAnswer] = useState(false);
    const [timerVersion, setTimerVersion] = useState<number | null>(null);
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
        if (!gameId || !effectivePlayerName) return;

        // Whether it's a fresh join or a reconnect, we send "join-game".
        // The server now handles the difference.
        sendJson({
            type: "join-game",
            gameId,
            playerName: effectivePlayerName,
        });

    }, [ gameId, effectivePlayerName, sendJson]);

    useEffect(() => {
        boardDataRef.current = boardData;
    }, [boardData]);

    useEffect(() => {

        sendJson({
            type: "update-cleared-clues",
            gameId,
            clearedClues: Array.from(clearedClues),
        });


        if (
            activeBoard === 'firstBoard' && boardData.firstBoard.categories[0].category !== '' &&
            boardData.firstBoard.categories.every((category: Category) =>
                category.values.every((clue) => clearedClues.has(`${clue.value}-${clue.question}`))
            )
        ) {

            sendJson({
                type: "transition-to-second-board",
                gameId
            });
            setActiveBoard('secondBoard');
            setIsFinalJeopardy(false);


        } else if (
            activeBoard === 'secondBoard' && boardData.firstBoard.categories[0].category !== '' &&
            boardData.secondBoard.categories.every((category: Category) =>
                category.values.every((clue) => clearedClues.has(`${clue.value}-${clue.question}`))
            )
        ) {
            sendJson({
                type: "transition-to-final-jeopardy",
                gameId
            });
            setActiveBoard('finalJeopardy');
            setIsFinalJeopardy(true);
        }
    }, [clearedClues, gameId, activeBoard, boardData.firstBoard.categories, boardData.secondBoard.categories, sendJson]);

    const updateClearedClues = (newClearedClues: string[]) => {
        setClearedClues((prev) => {
            const updatedClues = new Set(prev);
            newClearedClues.forEach((clue: string) => updatedClues.add(clue));
            return updatedClues;
        });
    };

    const handleScoreUpdate = (player: string, delta: number) => {
        if (isFinalJeopardy && allWagersSubmitted) {
            const w = Math.abs(wagers[player] ?? 0);
            delta = (delta < 0 ? -w : w);
        }

        const newScores = {...scores, [player]: (scores[player] || 0) + delta};
        setScores(newScores);

        sendJson({ type: "update-score", gameId, player, delta });

    };


    const markAllCluesComplete = () => {
        if (!gameId) return;
        sendJson({ type: "mark-all-complete", gameId });
        // Update local state for cleared clues
        if (activeBoard === 'firstBoard') {
            const allClues = boardData.firstBoard.categories.flatMap((category: Category) => category.values.map((clue) => `${clue.value}-${clue.question}`)
            );
            setClearedClues(new Set(allClues));
        } else if (activeBoard === 'secondBoard') {
            const allClues = boardData.secondBoard.categories.flatMap((category: Category) => category.values.map((clue) => `${clue.value}-${clue.question}`)
            );
            setClearedClues(new Set(allClues.splice(0, 25)));
        }

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
        sendJson({ type: "buzz", gameId, playerName });
    };

    const onClueSelected = useCallback((clue: Clue) => {
        if (isHost && clue) {
            if (!gameId) return;
            sendJson({ type: "clue-selected", gameId, clue });

            setSelectedClue(clue); // Update the host's UI
            if (clue.value !== undefined) {
                setLastQuestionValue(clue.value); // Set last question value based on clue's value
            }
        }
    },[isHost, gameId, sendJson]);

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
                };


                setPlayers(m.players);
                setHost(m.host);
                setBuzzResult(m.buzzResult ? m.buzzResult : null);
                setBoardData(m.boardData);
                setScores(m.scores || {});

                if (m.clearedClues) updateClearedClues(m.clearedClues);

                if (m.selectedClue) {
                    setSelectedClue({
                        ...m.selectedClue,
                        showAnswer: m.selectedClue.isAnswerRevealed || false,
                    });
                }
                return;
            }

            if (message.type === "final-jeopardy") {
                setActiveBoard("finalJeopardy");

                setIsFinalJeopardy(true);

                setAllWagersSubmitted(false);
                setWagers({});

                setSelectedClue(null);
                setShowAnswer(false);
                setBuzzResult(null);
                setTimerEndTime(null);
                setTimerDuration(0);
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
                setTimerEndTime(null);
                setTimerDuration(0);
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
                return;
            }

            if (message.type === "clue-selected") {
                const m = message as unknown as { clue: Clue; clearedClues?: string[] };
                setSelectedClue({ ...m.clue, showAnswer: false });

                if (m.clearedClues) setClearedClues(new Set(m.clearedClues));
                return;
            }

            if (message.type === "timer-start") {
                const m = message as unknown as { endTime: number; duration: number; timerVersion: number };
                setTimerVersion(m.timerVersion);
                setTimerEndTime(m.endTime);
                setTimerDuration(m.duration);
                return;
            }

            if (message.type === "timer-end") {
                const m = message as unknown as { timerVersion: number };
                if (m.timerVersion === timerVersion) {
                    setTimerEndTime(null);
                    setTimerDuration(0);
                }
                return;
            }

            if (message.type === "answer-revealed") {
                setSelectedClue((prev) => (prev ? { ...prev, showAnswer: true } : prev));
                setShowAnswer(true);
                setTimerEndTime(null);
                setTimerDuration(0);
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
                setTimerEndTime(null);
                setTimerDuration(0);
                return;
            }

            if (message.type === "transition-to-second-board") {
                setActiveBoard("secondBoard");
                setClearedClues(new Set());

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
    }, [isSocketReady, subscribe, timerVersion, onClueSelected]);

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
                            showAnswer={showAnswer}
                            setShowAnswer={setShowAnswer}
                        />
                    </>
                )}
            </div>
        </div>
    );
}

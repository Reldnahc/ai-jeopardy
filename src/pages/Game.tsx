import {useCallback, useEffect, useRef, useState} from 'react';
import {useLocation, useParams} from 'react-router-dom';
import JeopardyBoard from '../components/game/JeopardyBoard.tsx';
import {Category, Clue} from "../types.ts";
import Sidebar from "../components/game/Sidebar.tsx";
import {DrawingPath} from "../utils/drawingUtils.tsx";
import FinalScoreScreen from "../components/game/FinalScoreScreen.tsx";
import {useWebSocket} from "../contexts/WebSocketContext.tsx";
import {Player} from "../types/Lobby.ts";
import {useDeviceContext} from "../contexts/DeviceContext.tsx";
import {useNavigationBlocker} from "../hooks/useNavigationBlocker.ts";
import MobileSidebar from "../components/game/MobileSidebar.tsx";

export default function Game() {
    const {gameId} = useParams<{ gameId: string }>();
    const location = useLocation();
    const playerName = location.state?.playerName || '';
    const [host, setHost] = useState<string | null>(null);
    const isHost = location.state?.isHost || false;
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
    const [boardData, setBoardData] = useState<{
        firstBoard: {
            categories: Category[];
        };
        secondBoard: {
            categories: Category[];
        };
        finalJeopardy: {
            categories: Category[];
        };
    }>({
        firstBoard: {
            categories: [
                { category: '', values: [] },
            ],
        },
        secondBoard: {
            categories: [
                { category: '', values: [] },
            ],
        },
        finalJeopardy: {
            categories: [
                { category: '', values: [] },
            ],
        },
    });

    // Persistent WebSocket connection
    const { socket, isSocketReady } = useWebSocket();
    const { deviceType } = useDeviceContext();

    const handleLeaveGame = useCallback(() => {
        console.log("leave game called");
        if (socket && isSocketReady) {
            socket.send(JSON.stringify({
                type: 'leave-game',
                gameId,
            }));
        }
    }, [socket, isSocketReady, gameId]); // Add dependencies


    const { setIsLeavingPage } = useNavigationBlocker({
        shouldBlock: !isGameOver,
        onLeave: handleLeaveGame,
        confirmMessage: 'Are you sure you want to leave? This will remove you from the current game.'
    });

    const boardDataRef = useRef(boardData);

    useEffect(() => {
        boardDataRef.current = boardData;
    }, [boardData]);

    useEffect(() => {
        if (socket && isSocketReady) {

            socket.onmessage = (event) => {
                const message = JSON.parse(event.data);
                console.log(message);
                if (message.type === 'game-state') {
                    setPlayers(message.players);
                    setHost(message.host);
                    setBuzzResult(message.buzzResult ? message.buzzResult : null);
                    console.log(message.boardData);
                    setBoardData(message.boardData); // Set the board data dynamically
                    setScores(message.scores || {}); // Initialize scores

                    if (message.clearedClues) {
                        // Push cleared clues to an external state handler
                        updateClearedClues(message.clearedClues);
                    }
                    if (message.selectedClue) {
                        setSelectedClue({
                            ...message.selectedClue,
                            showAnswer: message.selectedClue.isAnswerRevealed || false,
                        });
                    }

                }

                if (message.type === 'final-jeopardy') {
                    setActiveBoard('finalJeopardy');
                    //setIsFinalJeopardy(true);
                }

                if (message.type === "wager-update") {
                    console.log(`Player ${message.player} submitted a wager of $${message.wager}`);
                }

                if (message.type === "all-wagers-submitted") {
                    const {wagers} = message;

                    console.log("All wagers have been submitted! Final Jeopardy can begin.");
                    setAllWagersSubmitted(true);
                    setWagers(wagers);
                    const finalClue = boardDataRef.current.finalJeopardy?.categories?.[0]?.values?.[0];

                    if (!finalClue) {
                        console.error("Final Jeopardy clue missing when wagers submitted.", boardDataRef.current.finalJeopardy);
                    } else {
                        onClueSelected(finalClue);
                    }

                }

                if (message.type === 'player-list-update') {
                    const sortedPlayers = [...message.players].sort((a, b) => {
                        if (a.name === message.host) return -1;
                        if (b.name === message.host) return 1;
                        return 0;
                    });
                    setPlayers(sortedPlayers);
                    setHost(message.host);
                }

                if (message.type === 'buzz-result') {
                    setBuzzResult(message.playerName);
                    setTimerEndTime(null);
                    setTimerDuration(0);
                }

                if (message.type === 'buzzer-locked') {
                    setBuzzerLocked(true);
                }

                if (message.type === 'buzzer-unlocked') {
                    setBuzzerLocked(false);
                }

                if (message.type === 'reset-buzzer') {
                    setBuzzResult(null);
                    setBuzzerLocked(true);
                }

                if (message.type === 'game-over') {
                    setIsLeavingPage(true);
                    setIsGameOver(true); // Switch to the Final Score Screen
                }

                if (message.type === 'clue-selected') {
                    // Update the selected clue
                    setSelectedClue({
                        ...message.clue,
                        showAnswer: false, // Initialize as false when selected
                    });

                    // Sync cleared clues (received from the server)
                    if (message.clearedClues) {
                        setClearedClues(new Set(message.clearedClues)); // Convert array back to a Set
                    }
                }

                if (message.type === 'timer-start') {
                    const { endTime, duration, timerVersion } = message;
                    setTimerVersion(timerVersion); // Set active timer version
                    setTimerEndTime(endTime);
                    setTimerDuration(duration);
                }

                if (message.type === 'timer-end' && message.timerVersion === timerVersion) {
                    setTimerEndTime(null);
                    setTimerDuration(0);
                }

                if (message.type === 'answer-revealed') {
                    setSelectedClue((prevClue) => {
                        if (prevClue) {
                            return {...prevClue, showAnswer: true}; // Set showAnswer to true
                        }
                        return prevClue;
                    });
                    setShowAnswer(true);
                    setTimerEndTime(null);
                    setTimerDuration(0);
                }

                if (message.type === 'all-clues-cleared') {
                    const clearedClues = message.clearedClues; // Array of cleared clue IDs

                    if (clearedClues && Array.isArray(clearedClues)) {
                        setClearedClues(new Set(clearedClues)); // Update cleared clues state
                    }
                }

                if (message.type === 'clue-cleared') {
                    const {clueId} = message;
                    setClearedClues((prev) => new Set(prev).add(clueId));
                }

                if (message.type === 'returned-to-board') {
                    setSelectedClue(null); // Reset the selected clue
                    setBuzzResult(null);
                    setTimerEndTime(null);
                    setTimerDuration(0);
                }

                if (message.type === 'transition-to-second-board') {
                    setActiveBoard('secondBoard'); // Switch to second board
                    setClearedClues(new Set()); // Reset cleared clues
                }

                if (message.type === 'update-scores') {
                    setScores(message.scores);
                }

                if (message.type === "all-final-jeopardy-drawings-submitted") {
                    const {drawings} = message;
                    setDrawings(drawings);
                    console.log("All players have submitted their drawings.");
                }
            };
            socket.send(
                JSON.stringify({
                    type: 'request-player-list',
                    gameId,
                })
            );
        }
    }, [gameId, playerName, isHost, isSocketReady]);

    useEffect(() => {
        if (socket && isSocketReady) {
            socket.send(
                JSON.stringify({
                    type: 'update-cleared-clues',
                    gameId,
                    clearedClues: Array.from(clearedClues), // Send cleared clues to the server
                })
            );
        }

        if (
            activeBoard === 'firstBoard' && boardData.firstBoard.categories[0].category !== '' &&
            boardData.firstBoard.categories.every((category: Category) =>
                category.values.every((clue) => clearedClues.has(`${clue.value}-${clue.question}`))
            )
        ) {
            if (socket && isSocketReady) {
                socket.send(
                    JSON.stringify({
                        type: 'transition-to-second-board',
                        gameId,
                    })
                );
                setActiveBoard('secondBoard');
                setIsFinalJeopardy(false);

            }
        } else if (
            activeBoard === 'secondBoard' && boardData.firstBoard.categories[0].category !== '' &&
            boardData.secondBoard.categories.every((category: Category) =>
                category.values.every((clue) => clearedClues.has(`${clue.value}-${clue.question}`))
            )
        ) {
            if (socket && isSocketReady) {
                socket.send(
                    JSON.stringify({
                        type: 'transition-to-final-jeopardy',
                        gameId,
                    })
                );
                setActiveBoard('finalJeopardy');
                setIsFinalJeopardy(true);
            }

        }
    }, [clearedClues, gameId, activeBoard, isSocketReady]);

    const updateClearedClues = (newClearedClues: string[]) => {
        setClearedClues((prev) => {
            const updatedClues = new Set(prev);
            newClearedClues.forEach((clue: string) => updatedClues.add(clue));
            return updatedClues;
        });
    };

    const handleScoreUpdate = (player: string, delta: number) => {
        if (isFinalJeopardy && allWagersSubmitted){
            delta = wagers[player];//TODO fix negative final jeopardy wagers
        }
        const newScores = {...scores, [player]: (scores[player] || 0) + delta};
        setScores(newScores);
        if (socket && isSocketReady) {
            // Emit score update to server
            socket.send(
                JSON.stringify({
                    type: 'update-score',
                    gameId,
                    player,
                    delta,
                })
            );
        }
    };

    const markAllCluesComplete = () => {
        if (socket && isSocketReady) {
            socket.send(
                JSON.stringify({
                    type: 'mark-all-complete',
                    gameId,
                })
            );

            // Update local state for cleared clues
            if (activeBoard === 'firstBoard') {
                const allClues = boardData.firstBoard.categories.flatMap((category: Category) =>
                    category.values.map((clue) => `${clue.value}-${clue.question}`)
                );
                setClearedClues(new Set(allClues));
            } else if (activeBoard === 'secondBoard') {
                const allClues = boardData.secondBoard.categories.flatMap((category: Category) =>
                    category.values.map((clue) => `${clue.value}-${clue.question}`)
                );
                setClearedClues(new Set(allClues.splice(0, 25)));
            }
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
        if (socket && isSocketReady) {
            socket.send(JSON.stringify({type: 'buzz', gameId, playerName}));
        }
    };

    const onClueSelected = useCallback((clue: Clue) => {
        if (isHost && clue) {
            if (socket && isSocketReady) {
                socket.send(
                    JSON.stringify({
                        type: 'clue-selected',
                        gameId,
                        clue,
                    })
                );
            }
            setSelectedClue(clue); // Update the host's UI
            if (clue.value !== undefined) {
                setLastQuestionValue(clue.value); // Set last question value based on clue's value
            }
        }
    },[isHost, socket, isSocketReady, gameId]);

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

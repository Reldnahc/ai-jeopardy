import {useCallback, useEffect, useRef, useState} from 'react';
import {useLocation, useNavigate, useParams} from 'react-router-dom';
import JeopardyBoard from '../components/game/JeopardyBoard.tsx';
import {Category, Clue} from "../types.ts";
import Sidebar from "../components/game/Sidebar.tsx";
import FinalScoreScreen from "../components/game/FinalScoreScreen.tsx";
import {useWebSocket} from "../contexts/WebSocketContext.tsx";
import {useDeviceContext} from "../contexts/DeviceContext.tsx";
import MobileSidebar from "../components/game/MobileSidebar.tsx";
import {useGameSession} from "../hooks/useGameSession.ts";
import {useGameSocketSync} from "../hooks/game/useGameSocketSync.ts";
import {usePlayerIdentity} from "../hooks/usePlayerIdentity.ts";

export default function Game() {
    const {gameId} = useParams<{ gameId: string }>();
    const location = useLocation();
    const navigate = useNavigate();
    const { session, saveSession, clearSession  } = useGameSession();
    const playerName = location.state?.playerName || '';
    const [lastQuestionValue, setLastQuestionValue] = useState<number>(100);

    const { effectivePlayerName } = usePlayerIdentity({
        gameId,
        locationStatePlayerName: location.state?.playerName,
        allowProfileFallback: true,
    });

    const {
        isSocketReady,
        isHost,
        host,
        players,
        scores,
        boardData,
        activeBoard,
        selectedClue,
        clearedClues,
        buzzerLocked,
        buzzResult,
        buzzLockedOut,
        timerEndTime,
        timerDuration,
        isFinalJeopardy,
        allWagersSubmitted,
        wagers,
        drawings,
        isGameOver,
        markAllCluesComplete,
        resetBuzzer,
        unlockBuzzer,
    } = useGameSocketSync({ gameId, playerName: effectivePlayerName });

    // Persistent WebSocket connection
    const { sendJson } = useWebSocket();
    const { deviceType } = useDeviceContext();

    const boardDataRef = useRef(boardData);

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

    const handleBuzz = () => {
        if (!gameId) return;
        if (buzzResult || buzzLockedOut) return;

        // Always let server decide (including “buzz early” lockout)
        sendJson({ type: "buzz", gameId });
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
                            resetBuzzer={resetBuzzer}
                            unlockBuzzer={unlockBuzzer}
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

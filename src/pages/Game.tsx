import {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {useLocation, useNavigate, useParams} from 'react-router-dom';
import JeopardyBoard from '../components/game/JeopardyBoard.tsx';
import {Clue} from "../types.ts";
import Sidebar from "../components/game/Sidebar.tsx";
import FinalScoreScreen from "../components/game/FinalScoreScreen.tsx";
import {useWebSocket} from "../contexts/WebSocketContext.tsx";
import {useDeviceContext} from "../contexts/DeviceContext.tsx";
import MobileSidebar from "../components/game/MobileSidebar.tsx";
import {useGameSession} from "../hooks/useGameSession.ts";
import {BoardData, useGameSocketSync} from "../hooks/game/useGameSocketSync.ts";
import {usePlayerIdentity} from "../hooks/usePlayerIdentity.ts";
import {usePreloadBoardImages} from "../hooks/game/usePreloadBoardImages.ts";

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
        narrationEnabled,
        requestTts,
        ttsReady,
    } = useGameSocketSync({ gameId, playerName: effectivePlayerName });

    // Persistent WebSocket connection
    const { sendJson } = useWebSocket();
    const { deviceType } = useDeviceContext();
    const audioRef = useRef<HTMLAudioElement | null>(null);
    const [audioMuted, setAudioMuted] = useState<boolean>(() => {
        try {
            return localStorage.getItem("aj_audioMuted") === "1";
        } catch {
            return false;
        }
    });

    const toggleAudioMuted = useCallback(() => {
        setAudioMuted((prev) => {
            const next = !prev;
            try { localStorage.setItem("aj_audioMuted", next ? "1" : "0"); } catch {}

            if (audioRef.current) {
                audioRef.current.muted = next;
            }

            return next;
        });
    }, []);

    const narratedKeysRef = useRef<Set<string>>(new Set());
    const lastRequestedKeyRef = useRef<string | null>(null);
    const prevSocketReadyRef = useRef<boolean>(false);

    const clueOpenKey = useMemo(() => {
        if (!selectedClue) return null;

        const v = String(selectedClue.value);
        const q = (selectedClue.question ?? "").trim();
        return `${activeBoard}:${v}:${q}`;
    }, [activeBoard, selectedClue]);


    const activeTtsRequestIdRef = useRef<string | null>(null);
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

    const playAudioUrl = useCallback((url: string) => {
        const a = audioRef.current;
        if (!a) return;
        try {
            a.pause();
            a.muted = audioMuted;
            a.currentTime = 0;
            a.src = url;
            void a.play();
        } catch (e) {
            console.debug("TTS play blocked:", e);
        }
    }, [audioMuted]);

    useEffect(() => {
        audioRef.current = new Audio();
        audioRef.current.preload = "auto";

        return () => {
            if (audioRef.current) {
                audioRef.current.pause();
                audioRef.current.src = "";
                audioRef.current = null;
            }
        };
    }, []);

    useEffect(() => {
        const wasReady = prevSocketReadyRef.current;
        const nowReady = Boolean(isSocketReady);
        prevSocketReadyRef.current = nowReady;

        if (!wasReady && nowReady) {
            // Treat this as a (re)hydration moment.
            lastRequestedKeyRef.current = null;
            narratedKeysRef.current.clear();
        }
    }, [isSocketReady]);

    useEffect(() => {
        if (!narrationEnabled) {
            lastRequestedKeyRef.current = null;
            return;
        }

        if (audioMuted) {
            lastRequestedKeyRef.current = null;
            return;
        }

        // No clue open
        if (!clueOpenKey || !selectedClue) {
            lastRequestedKeyRef.current = null;
            return;
        }

        // Prevent repeats if the selected clue object is recreated.
        if (lastRequestedKeyRef.current === clueOpenKey) return;

        // Only narrate a clue once per client session.
        if (narratedKeysRef.current.has(clueOpenKey)) {
            lastRequestedKeyRef.current = clueOpenKey;
            return;
        }

        // ✅ FAST PATH: if server provided mapping, play immediately (no WS noise)
        const mappedAssetId = (boardData as BoardData)?.ttsByClueKey?.[clueOpenKey];
        if (typeof mappedAssetId === "string" && mappedAssetId.trim()) {
            playAudioUrl(`/api/tts/${mappedAssetId.trim()}`);
            narratedKeysRef.current.add(clueOpenKey);
            lastRequestedKeyRef.current = clueOpenKey;
            return;
        }

        // Fallback: old on-demand behavior
        const valuePart = `For ${selectedClue.value} dollars. `;
        const text = `${valuePart}${selectedClue.question ?? ""}`.trim();
        if (!text) return;

        activeTtsRequestIdRef.current = requestTts({ text, textType: "text", voiceId: "Matthew" });
        narratedKeysRef.current.add(clueOpenKey);
        lastRequestedKeyRef.current = clueOpenKey;
    }, [narrationEnabled, audioMuted, clueOpenKey, selectedClue, requestTts, boardData, playAudioUrl]);

    useEffect(() => {
        if (!ttsReady) return;

        if (audioMuted) return;

        // Ignore stale responses
        if (ttsReady.requestId && activeTtsRequestIdRef.current && ttsReady.requestId !== activeTtsRequestIdRef.current) {
            return;
        }

        const a = audioRef.current;
        if (!a) return;

        try {
            a.pause();
            a.currentTime = 0;
            a.src = ttsReady.url;
            playAudioUrl(ttsReady.url);
        } catch (e) {
            // autoplay policies can block play(); ignore safely
            console.debug("TTS play blocked:", e);
        }
    }, [ttsReady, audioMuted]);

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

    // Memoize the board data so the preloader doesn't reset on every re-render
    const memoizedBoardData = useMemo(() => boardData, [
        // Only change if the actual content (like categories length) changes
        boardData?.firstBoard?.categories?.length,
        boardData?.secondBoard?.categories?.length,
        boardData?.finalJeopardy?.categories?.length
    ]);

    usePreloadBoardImages(memoizedBoardData, Boolean(memoizedBoardData));

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
                    narrationEnabled={narrationEnabled}
                    audioMuted={audioMuted}
                    onToggleAudioMuted={toggleAudioMuted}
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
                    narrationEnabled={narrationEnabled}
                    audioMuted={audioMuted}
                    onToggleAudioMuted={toggleAudioMuted}
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
import {useCallback, useEffect, useRef, useState} from 'react';
import {useLocation, useNavigate, useParams} from 'react-router-dom';
import JeopardyBoard from '../components/game/JeopardyBoard.tsx';
import Sidebar from "../components/game/Sidebar.tsx";
import FinalScoreScreen from "../components/game/FinalScoreScreen.tsx";
import {useWebSocket} from "../contexts/WebSocketContext.tsx";
import {useDeviceContext} from "../contexts/DeviceContext.tsx";
import MobileSidebar from "../components/game/MobileSidebar.tsx";
import {useGameSession} from "../hooks/useGameSession.ts";
import {useGameSocketSync} from "../hooks/game/useGameSocketSync.ts";
import {usePlayerIdentity} from "../hooks/usePlayerIdentity.ts";
import {usePreload} from "../hooks/game/usePreload.ts";
import {useEarlyMicPermission} from "../hooks/earlyMicPermission.ts";
import {Clue} from "../../shared/types/board.ts";
import {getCachedAudioBlobUrl} from "../audio/audioCache.ts";

function getApiBase() {
    // In dev, allow explicit override
    if (import.meta.env.DEV) {
        return import.meta.env.VITE_API_BASE || "http://localhost:3002";
    }

    // In prod, use same-origin
    return "";
}

function ttsUrl(id: string) {
    return `${getApiBase()}/api/tts/${encodeURIComponent(id)}`;
}

export default function Game() {
    const {gameId} = useParams<{ gameId: string }>();
    const location = useLocation();
    const navigate = useNavigate();
    const { session, saveSession, clearSession  } = useGameSession();
    const playerName = location.state?.playerName || '';
    const [lastQuestionValue, setLastQuestionValue] = useState<number>(100);

    const { effectivePlayerName, playerKey } = usePlayerIdentity({
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
        finalWagers,
        drawings,
        isGameOver,
        markAllCluesComplete,
        narrationEnabled,
        answerCapture,
        answerError,
        phase,
        selectorKey,
        selectorName,
        aiHostAsset,
        boardSelectionLocked,
        selectedFinalist,
        ddWagerCapture,
        ddWagerError,
        showDdModal,
        showWager,
        finalists
    } = useGameSocketSync({ gameId, playerName: effectivePlayerName });

    // Persistent WebSocket connection
    const { sendJson } = useWebSocket();
    const { deviceType } = useDeviceContext();
    const audioRef = useRef<HTMLAudioElement | null>(null);
    const audioCtxRef = useRef<AudioContext | null>(null);
    const gainNodeRef = useRef<GainNode | null>(null);
    const compressorRef = useRef<DynamicsCompressorNode | null>(null);

    const buzzSeqRef = useRef(0);

    const AUDIO_VOLUME_KEY = "aj_audioVolume";
    const AUDIO_LAST_NONZERO_KEY = "aj_audioLastNonZeroVolume";

    const [audioVolume, setAudioVolume] = useState<number>(() => {
        try {
            const raw = localStorage.getItem(AUDIO_VOLUME_KEY);
            const v = raw == null ? 1 : Number(raw);
            if (!Number.isFinite(v)) return 1;
            return Math.min(1, Math.max(0, v));
        } catch {
            return 1;
        }
    });

    const audioMuted = audioVolume <= 0;

    useEffect(() => {
        try {
            localStorage.setItem(AUDIO_VOLUME_KEY, String(audioVolume));
            if (audioVolume > 0) {
                localStorage.setItem(AUDIO_LAST_NONZERO_KEY, String(audioVolume));
            }
        } catch {
            // ignore
        }
    }, [audioVolume]);


    const toggleAudioMuted = useCallback(() => {
        setAudioVolume((prev) => {
            if (prev > 0) return 0;

            try {
                const raw = localStorage.getItem(AUDIO_LAST_NONZERO_KEY);
                const v = raw == null ? 1 : Number(raw);
                if (Number.isFinite(v) && v > 0) return Math.min(1, Math.max(0, v));
            } catch {
                // ignore
            }
            return 1;
        });
    }, []);


    const isSelectorOnBoard = Boolean(
        phase === "board" &&
        selectorName &&
        playerKey &&
        selectorKey === playerKey
    );

    const canSelectClue = Boolean(isSelectorOnBoard && !boardSelectionLocked);


    const narratedKeysRef = useRef<Set<string>>(new Set());
    const lastRequestedKeyRef = useRef<string | null>(null);
    const prevSocketReadyRef = useRef<boolean>(false);


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

    const playAudioUrl = useCallback((httpUrl: string) => {
        const a = audioRef.current;
        if (!a) return;

        try {
            a.pause();

            // Volume-based “mute”
            a.muted = false;
            const gain = gainNodeRef.current;
            if (gain) gain.gain.value = audioVolume;

            a.currentTime = 0;

            // ✅ If we preloaded this URL, use the blob URL so there is NO network on play.
            const blobUrl = getCachedAudioBlobUrl(httpUrl);
            a.src = blobUrl || httpUrl;

            if (audioVolume <= 0) return;

            void a.play();
        } catch (e) {
            console.debug("TTS play blocked:", e);
        }
    }, [audioVolume]);


    const lastAiHostAssetPlayedRef = useRef<string | null>(null);

    const gameReadySentRef = useRef(false);

    useEffect(() => {
        if (gameReadySentRef.current) return;
        if (!isSocketReady) return;
        if (!gameId) return;
        if (!playerKey) return;
        if (!effectivePlayerName) return;

        // Important: wait until we've received at least one game-state
        // so we know the game page hook is hydrated + subscribed.
        if (!host) return;

        gameReadySentRef.current = true;

        sendJson({
            type: "game-ready",
            gameId,
            playerKey,
            playerName: effectivePlayerName,
        });
    }, [isSocketReady, gameId, playerKey, effectivePlayerName, host, sendJson]);

    useEffect(() => {
        if (!aiHostAsset) return;

        if (lastAiHostAssetPlayedRef.current === aiHostAsset) return;
        lastAiHostAssetPlayedRef.current = aiHostAsset;

        const idx = aiHostAsset.indexOf("::");
        const assetId = (idx >= 0 ? aiHostAsset.slice(idx + 2) : aiHostAsset).trim();
        if (!assetId) return;

        // Page owns audio policy
        if (!narrationEnabled) return;
        if (audioMuted) return;

        // Direct stream from your backend (already implemented)
        playAudioUrl(ttsUrl(assetId));
        }, [aiHostAsset, narrationEnabled, audioMuted, playAudioUrl]);


    useEffect(() => {
        const audio = new Audio();
        audio.preload = "auto";
        audio.crossOrigin = "anonymous";

        const ctx = new AudioContext();
        const source = ctx.createMediaElementSource(audio);

        const gain = ctx.createGain();
        const compressor = ctx.createDynamicsCompressor();

        // Gentle loudness boost without distortion
        compressor.threshold.value = -18;
        compressor.knee.value = 12;
        compressor.ratio.value = 3;
        compressor.attack.value = 0.003;
        compressor.release.value = 0.25;

        source.connect(gain);
        gain.connect(compressor);
        compressor.connect(ctx.destination);

        audioRef.current = audio;
        audioCtxRef.current = ctx;
        gainNodeRef.current = gain;
        compressorRef.current = compressor;

        return () => {
            audio.pause();
            audio.src = "";

            source.disconnect();
            gain.disconnect();
            compressor.disconnect();

            void ctx.close();

            audioRef.current = null;
            audioCtxRef.current = null;
            gainNodeRef.current = null;
            compressorRef.current = null;
        };
    }, []);

    useEffect(() => {
        const gain = gainNodeRef.current;
        if (!gain) return;

        gain.gain.value = audioVolume;
    }, [audioVolume]);

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

    usePreload(boardData, Boolean(boardData));

    const { nowFromPerfMs, perfNowMs, lastSyncAgeMs } = useWebSocket();

    const handleBuzz = () => {
        if (!gameId) return;
        if (buzzResult || buzzLockedOut) return;

        // if sync is stale, either force a sync or fall back (I’d still send, server can decide)

        const clientBuzzPerfMs = perfNowMs();
        const clientSeq = ++buzzSeqRef.current;

        const syncAge = lastSyncAgeMs?.() ?? Number.POSITIVE_INFINITY;

        const payload: any = {
            type: "buzz",
            gameId,
            clientBuzzPerfMs,
            clientSeq,
            syncAgeMs: syncAge,
        };

        if (Number.isFinite(syncAge) && syncAge <= 20_000) {
            payload.estimatedServerBuzzAtMs = nowFromPerfMs();
        }

        sendJson(payload);
    };



    const onClueSelected = useCallback((clue: Clue) => {
        if (canSelectClue  && clue) {
            if (!gameId) return;
            sendJson({ type: "clue-selected", gameId, clue });
            if (clue.value !== undefined) {
                setLastQuestionValue(clue.value); // Set last question value based on clue's value
            }
        }
    },[canSelectClue, gameId, sendJson]);

    useEarlyMicPermission();

    return (
        <div
            className="flex h-screen w-screen overflow-hidden font-sans bg-gradient-to-b from-[#183a75] via-[#2a5fb3] to-[#1c4a96]"
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
                    players={players}
                    scores={scores}
                    buzzResult={buzzResult}
                    narrationEnabled={narrationEnabled}
                    audioVolume={audioVolume}
                    onChangeAudioVolume={setAudioVolume}
                    lastQuestionValue={lastQuestionValue}
                    activeBoard={activeBoard}
                    handleScoreUpdate={handleScoreUpdate}
                    markAllCluesComplete={markAllCluesComplete}
                    onLeaveGame={leaveGame}
                    selectorName={selectorName}
                    onToggleDailyDoubleSnipe={(enabled) => {
                        sendJson({
                            type: "dd-snipe-next",
                            gameId,
                            enabled,
                        });
                    }}
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
                            canSelectClue={canSelectClue}
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
                            handleBuzz={handleBuzz}
                            buzzerLocked={buzzerLocked}
                            buzzResult={buzzResult}
                            buzzLockedOut={buzzLockedOut}
                            timerEndTime={timerEndTime}
                            timerDuration={timerDuration}
                            answerCapture={answerCapture}
                            answerError={answerError}
                            effectivePlayerName={effectivePlayerName}
                            finalWagers={finalWagers}
                            selectedFinalist={selectedFinalist}
                            ddWagerCapture={ddWagerCapture}
                            ddWagerError={ddWagerError}
                            showDdModal={showDdModal}
                            showWager={showWager}
                            finalists={finalists}
                        />
                    </>
                )}
            </div>
        </div>
    );
}
// frontend/pages/Game.tsx
import { useCallback, useEffect, useRef, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import JeopardyBoard from "../components/game/JeopardyBoard.tsx";
import Sidebar from "../components/game/Sidebar.tsx";
import FinalScoreScreen from "../components/game/FinalScoreScreen.tsx";
import { useWebSocket } from "../contexts/WebSocketContext.tsx";
import { useGameSession } from "../hooks/useGameSession.ts";
import { useGameSocketSync } from "../hooks/game/useGameSocketSync.ts";
import { usePlayerIdentity } from "../hooks/usePlayerIdentity.ts";
import { usePreload } from "../hooks/game/usePreload.ts";
import { useEarlyMicPermission } from "../hooks/earlyMicPermission.ts";
import { Clue } from "../../shared/types/board.ts";
import { getCachedAudioBlobUrl } from "../audio/audioCache.ts";
import {BuzzPayload} from "../types/Game.ts";

function getApiBase() {
    if (import.meta.env.DEV) return import.meta.env.VITE_API_BASE || "http://localhost:3002";
    return "";
}

function ttsUrl(id: string) {
    return `${getApiBase()}/api/tts/${encodeURIComponent(id)}`;
}

function norm(v: unknown) {
    return String(v ?? "").trim().toLowerCase();
}

export default function Game() {
    const { gameId } = useParams<{ gameId: string }>();
    const location = useLocation();
    const navigate = useNavigate();
    const { session, saveSession, clearSession } = useGameSession();

    const [lastQuestionValue, setLastQuestionValue] = useState<number>(100);

    // NOTE: your hook expects `locationState`, not `locationStatePlayerName`
    const { username, displayname, playerKey } = usePlayerIdentity({
        gameId,
        locationState: location.state ?? null,
        allowProfileFallback: true,
    });

    const myUsername = norm(username);
    const myDisplayname = String(displayname ?? "").trim();

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
        buzzResultDisplay,
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
        finalists,
        answerProcessing,
    } = useGameSocketSync({ gameId, username: myUsername });

    // Persistent WebSocket connection
    const { sendJson, nowFromPerfMs, perfNowMs, lastSyncAgeMs } = useWebSocket();

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
            if (audioVolume > 0) localStorage.setItem(AUDIO_LAST_NONZERO_KEY, String(audioVolume));
        } catch {
            // ignore
        }
    }, [audioVolume]);

    const isSelectorOnBoard = Boolean(
        phase === "board" &&
        myUsername &&
        selectorKey &&
        norm(selectorKey) === myUsername
    );

    const canSelectClue = Boolean(isSelectorOnBoard && !boardSelectionLocked);

    const narratedKeysRef = useRef<Set<string>>(new Set());
    const lastRequestedKeyRef = useRef<string | null>(null);
    const prevSocketReadyRef = useRef<boolean>(false);

    const boardDataRef = useRef(boardData);

    const handleScoreUpdate = (playerUsername: string, delta: number) => {
        if (!gameId) return;

        const u = norm(playerUsername);
        if (!u) return;

        // Final Jeopardy: host buttons mean +wager / -wager, not +/- lastQuestionValue.
        if (isFinalJeopardy && allWagersSubmitted) {
            const w = Math.abs(wagers[u] ?? 0);
            delta = delta < 0 ? -w : w;
        }

        sendJson({ type: "update-score", gameId, username: u, delta });
    };

    const leaveGame = useCallback(() => {
        if (!gameId) {
            clearSession();
            navigate("/");
            return;
        }

        if (isSocketReady) {
            sendJson({
                type: "leave-game",
                gameId,
                username: myUsername || null,
            });
        }

        clearSession();
        navigate("/");
    }, [gameId, myUsername, isSocketReady, sendJson, clearSession, navigate]);


    const playAudioUrl = useCallback(
        (httpUrl: string) => {
            const a = audioRef.current;
            if (!a) return;

            try {
                a.pause();

                // Volume-based “mute”
                a.muted = false;
                const gain = gainNodeRef.current;
                if (gain) gain.gain.value = audioVolume;

                a.currentTime = 0;

                // If we preloaded this URL, use the blob URL so there is NO network on play.
                const blobUrl = getCachedAudioBlobUrl(httpUrl);
                a.src = blobUrl || httpUrl;

                if (audioVolume <= 0) return;
                void a.play();
            } catch (e) {
                console.debug("TTS play blocked:", e);
            }
        },
        [audioVolume]
    );

    const lastAiHostAssetPlayedRef = useRef<string | null>(null);
    const gameReadySentRef = useRef(false);

    useEffect(() => {
        if (gameReadySentRef.current) return;
        if (!isSocketReady) return;
        if (!gameId) return;

        // IMPORTANT: identity is username now
        if (!myUsername) return;

        // Wait until we’ve received at least one game-state
        if (!host) return;

        gameReadySentRef.current = true;

        sendJson({
            type: "game-ready",
            gameId,
            username: myUsername,
        });
    }, [isSocketReady, gameId, myUsername, host, sendJson]);

    useEffect(() => {
        if (!aiHostAsset) return;
        if (lastAiHostAssetPlayedRef.current === aiHostAsset) return;
        lastAiHostAssetPlayedRef.current = aiHostAsset;

        const idx = aiHostAsset.indexOf("::");
        const assetId = (idx >= 0 ? aiHostAsset.slice(idx + 2) : aiHostAsset).trim();
        if (!assetId) return;

        if (!narrationEnabled) return;
        if (audioMuted) return;

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
            lastRequestedKeyRef.current = null;
            narratedKeysRef.current.clear();
        }
    }, [isSocketReady]);

    // Persist session as username + displayname
    useEffect(() => {
        if (!gameId) return;

        // You at least need a displayname (guests have one)
        if (!myDisplayname) return;

        // Only write if different
        const same =
            session?.gameId === gameId &&
            String(session?.playerKey ?? "") === String(playerKey ?? "") &&
            (session?.username ?? null) === (username ?? null) &&
            String(session?.displayname ?? "") === myDisplayname &&
            session?.isHost === isHost;

        if (same) return;

        saveSession({
            gameId,
            playerKey: String(playerKey ?? ""),
            username: username ?? null,
            displayname: myDisplayname,
            isHost: Boolean(isHost),
        });
    }, [gameId, playerKey, username, myDisplayname, isHost, saveSession, session]);


    // Join game (username identity)
    useEffect(() => {
        if (!isSocketReady) return;
        if (!gameId) return;

        // If user is not logged in (username null), you need a guest username strategy.
        // For now, only join when username exists.
        if (!myUsername) return;

        sendJson({
            type: "join-game",
            gameId,
            username: myUsername,
            displayname: myDisplayname || null,
            // keep temporarily if server still expects it somewhere (but should be removed soon)
            playerKey,
        });
    }, [gameId, myUsername, myDisplayname, playerKey, sendJson, isSocketReady]);

    useEffect(() => {
        boardDataRef.current = boardData;
    }, [boardData]);

    usePreload(boardData, Boolean(boardData));

    const handleBuzz = () => {
        if (!gameId) return;
        if (buzzResult || buzzLockedOut) return;

        const clientBuzzPerfMs = perfNowMs();
        const clientSeq = ++buzzSeqRef.current;

        const syncAge = lastSyncAgeMs?.() ?? Number.POSITIVE_INFINITY;

        const payload: BuzzPayload  = {
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

    const onClueSelected = useCallback(
        (clue: Clue) => {
            if (!canSelectClue || !clue) return;
            if (!gameId) return;

            sendJson({ type: "clue-selected", gameId, clue });

            if (clue.value !== undefined) setLastQuestionValue(clue.value);
        },
        [canSelectClue, gameId, sendJson]
    );

    useEarlyMicPermission();

    const safeActiveBoard = activeBoard || "firstBoard";
    const safeCategories = boardData?.[safeActiveBoard]?.categories;

    return (
        <div className="flex h-screen w-screen overflow-hidden font-sans bg-gradient-to-b from-[#183a75] via-[#2a5fb3] to-[#1c4a96]">
            <Sidebar
                players={players}
                scores={scores}
                buzzResult={buzzResult}
                narrationEnabled={narrationEnabled}
                audioVolume={audioVolume}
                onChangeAudioVolume={setAudioVolume}
                lastQuestionValue={lastQuestionValue}
                activeBoard={safeActiveBoard}
                handleScoreUpdate={handleScoreUpdate}
                markAllCluesComplete={markAllCluesComplete}
                onLeaveGame={leaveGame}
                selectorName={selectorName}
                onToggleDailyDoubleSnipe={(enabled) => {
                    sendJson({ type: "dd-snipe-next", gameId, enabled });
                }}
            />

            <div className="flex flex-1 justify-center items-center overflow-hidden p-0">
                {isGameOver ? (
                    <FinalScoreScreen scores={scores} />
                ) : (
                    <>
                        <JeopardyBoard
                            boardData={safeCategories || []}
                            canSelectClue={canSelectClue}
                            onClueSelected={onClueSelected}
                            selectedClue={selectedClue || null}
                            gameId={gameId || ""}
                            clearedClues={clearedClues}
                            players={players}
                            scores={scores}
                            currentPlayer={myUsername}
                            allWagersSubmitted={allWagersSubmitted}
                            isFinalJeopardy={isFinalJeopardy}
                            drawings={drawings}
                            handleBuzz={handleBuzz}
                            buzzerLocked={buzzerLocked}
                            buzzResult={buzzResult}
                            buzzResultDisplay={buzzResultDisplay}
                            buzzLockedOut={buzzLockedOut}
                            timerEndTime={timerEndTime}
                            timerDuration={timerDuration}
                            answerCapture={answerCapture}
                            answerError={answerError}
                            myUsername={myUsername}
                            finalWagers={finalWagers}
                            selectedFinalist={selectedFinalist}
                            ddWagerCapture={ddWagerCapture}
                            ddWagerError={ddWagerError}
                            showDdModal={showDdModal}
                            showWager={showWager}
                            finalists={finalists}
                            answerProcessing={answerProcessing}
                        />
                    </>
                )}
            </div>
        </div>
    );
}

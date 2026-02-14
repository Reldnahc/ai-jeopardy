import React, { useEffect } from "react";
import { Clue } from "../../../shared/types/board.ts";
import { useWebSocket } from "../../contexts/WebSocketContext.tsx";
import BuzzAnimation from "./BuzzAnimation.tsx";
import Timer from "./Timer.tsx";
import FinalJeopardyPanel from "./FinalJeopardyPanel.tsx";
import {AnswerProcessingMsg, DailyDoubleShowModalMsg} from "../../hooks/game/useGameSocketSync.ts";

interface SelectedClueDisplayProps {
    localSelectedClue: Clue;
    showAnswer: boolean;
    isFinalJeopardy: boolean;
    gameId: string;
    currentPlayer: string;
    // @ts-expect-error sketch type of issue
    canvasRef: React.RefObject<ReactSketchCanvas>;
    drawings: Record<string, string> | null;
    drawingSubmitted: Record<string, boolean>;
    setDrawingSubmitted: React.Dispatch<React.SetStateAction<Record<string, boolean>>>;
    handleBuzz: () => void;
    buzzerLocked: boolean;
    buzzResult: string | null;
    buzzLockedOut: boolean;
    timerEndTime: number | null;
    timerDuration: number;
    answerCapture: {
        playerName: string;
        answerSessionId: string;
        clueKey: string;
        durationMs: number;
        deadlineAt: number;
    } | null;

    answerError: string | null;
    effectivePlayerName: string | null;
    finalWagers: Record<string, number>;
    selectedFinalist: string;
    showDdModal: DailyDoubleShowModalMsg | null;
    showWager: boolean;
    finalists: string[];
    answerProcessing: AnswerProcessingMsg | null;
}

const SelectedClueDisplay: React.FC<SelectedClueDisplayProps> = ({
                                                                     localSelectedClue,
                                                                     showAnswer,
                                                                     isFinalJeopardy,
                                                                     gameId,
                                                                     currentPlayer,
                                                                     canvasRef,
                                                                     drawings,
                                                                     drawingSubmitted,
                                                                     setDrawingSubmitted,
                                                                     handleBuzz,
                                                                     buzzerLocked,
                                                                     buzzResult,
                                                                     buzzLockedOut,
                                                                     timerEndTime,
                                                                     timerDuration,
                                                                     answerCapture,
                                                                     answerError,
                                                                     effectivePlayerName,
                                                                     finalWagers,
                                                                     selectedFinalist,
                                                                     showDdModal,
                                                                     showWager,
                                                                     finalists,
                                                                     answerProcessing
                                                                 }) => {
    const { sendJson } = useWebSocket();

    const imageAssetId =
        localSelectedClue?.media?.type === "image"
            ? localSelectedClue.media.assetId
            : null;

    const recorderRef = React.useRef<MediaRecorder | null>(null);
    const chunksRef = React.useRef<BlobPart[]>([]);
    const sentSessionRef = React.useRef<string | null>(null);

    function blobToBase64(blob: Blob): Promise<string> {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onerror = () => reject(reader.error);
            reader.onloadend = () => {
                const result = String(reader.result || "");
                // "data:audio/webm;codecs=opus;base64,AAAA..."
                const base64 = result.split(",")[1] || "";
                resolve(base64);
            };
            reader.readAsDataURL(blob);
        });
    }

    function pickMimeType(): string {
        const preferred = "audio/webm;codecs=opus";
        if (typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(preferred)) return preferred;
        if (typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported("audio/webm")) return "audio/webm";
        return ""; // let browser pick
    }

    const isAnsweringPlayer =
        !!answerCapture &&
        !!effectivePlayerName &&
        answerCapture.playerName === effectivePlayerName;

    useEffect(() => {
        // Only the selected player records
        if (!answerCapture || !isAnsweringPlayer) return;

        // Don’t resend for same session
        if (sentSessionRef.current === answerCapture.answerSessionId) return;

        let cancelled = false;

        const start = async () => {
            let stream: MediaStream | null = null;
            let audioCtx: AudioContext | null = null;
            let analyser: AnalyserNode | null = null;
            let source: MediaStreamAudioSourceNode | null = null;
            let vadTimer: number | null = null;

            try {
                stream = await navigator.mediaDevices.getUserMedia({
                    audio: {
                        channelCount: 1,
                        sampleRate: 16000,
                        echoCancellation: true,
                        noiseSuppression: true,
                        autoGainControl: true,
                    },
                });

                const mime = pickMimeType();

                chunksRef.current = [];
                const rec = new MediaRecorder(
                    stream,
                    mime
                        ? {
                            mimeType: mime,
                            audioBitsPerSecond: 24000, // try 16000–32000
                            bitsPerSecond: 24000,
                        }
                        : {
                            audioBitsPerSecond: 24000,
                            bitsPerSecond: 24000,
                        }
                );
                recorderRef.current = rec;

                // --- VAD setup (detect when they've spoken, then stop after silence) ---
                const END_SILENCE_MS = 900; // stop after this much silence *after speech*
                const VAD_INTERVAL_MS = 80; // how often to sample audio
                const RMS_THRESHOLD = 0.018; // tweak: lower = more sensitive, higher = less sensitive

                audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
                source = audioCtx.createMediaStreamSource(stream);
                analyser = audioCtx.createAnalyser();
                analyser.fftSize = 2048;
                source.connect(analyser);

                const data = new Float32Array(analyser.fftSize);

                let hasSpoken = false;
                let lastVoiceAt = 0;
                let maxRms = 0;
                let voiceTicks = 0;
                const startedAt = Date.now();

                const computeRms = () => {
                    if (!analyser) return 0;
                    analyser.getFloatTimeDomainData(data);
                    let sum = 0;
                    for (let i = 0; i < data.length; i++) sum += data[i] * data[i];
                    return Math.sqrt(sum / data.length);
                };

                const scheduleVadTick = () => {
                    if (cancelled) return;
                    if (!recorderRef.current) return;

                    const level = computeRms();
                    if (level > maxRms) maxRms = level;

                    if (level > RMS_THRESHOLD) {
                        voiceTicks += 1;
                    }
                    const now = Date.now();

                    if (level > RMS_THRESHOLD) {
                        hasSpoken = true;
                        lastVoiceAt = now;
                    }

                    // Only stop early after we've heard speech, then a silence gap
                    if (hasSpoken && now - lastVoiceAt >= END_SILENCE_MS) {
                        try {
                            if (rec.state !== "inactive") rec.stop();
                        } catch {
                            // ignore
                        }
                        return;
                    }

                    vadTimer = window.setTimeout(scheduleVadTick, VAD_INTERVAL_MS);
                };

                rec.ondataavailable = (e) => {
                    if (e.data && e.data.size > 0) chunksRef.current.push(e.data);
                };

                rec.onstop = async () => {
                    // Stop VAD timer
                    if (vadTimer) {
                        window.clearTimeout(vadTimer);
                        vadTimer = null;
                    }

                    // Cleanup audio graph
                    try {
                        source?.disconnect();
                    } catch {
                        /* ignore */
                    }
                    try {
                        analyser?.disconnect();
                    } catch {
                        /* ignore */
                    }
                    try {
                        await audioCtx?.close();
                    } catch {
                        /* ignore */
                    }

                    // Stop tracks
                    try {
                        stream?.getTracks().forEach((t) => t.stop());
                    } catch {
                        // ignore
                    }

                    if (cancelled) return;

                    const endedAt = Date.now();
                    const durationMs = endedAt - startedAt;
                    const voiceMs = voiceTicks * VAD_INTERVAL_MS;

                    if (!hasSpoken) {
                        // Mark sent now so we never duplicate
                        sentSessionRef.current = answerCapture.answerSessionId;

                        console.log("[mic] no speech detected, sending noSpeech", {
                            session: answerCapture.answerSessionId,
                            durationMs,
                            maxRms,
                        });

                        sendJson({
                            type: "answer-audio-blob",
                            gameId,
                            answerSessionId: answerCapture.answerSessionId,
                            mimeType: rec.mimeType || "audio/webm",
                            noSpeech: true,
                            vad: { hasSpoken: false, maxRms, voiceMs, durationMs },
                            dataBase64: "", // keep server happy if it expects a string
                        });

                        return;
                    }

                    const blob = new Blob(chunksRef.current, { type: rec.mimeType || "audio/webm" });
                    chunksRef.current = [];

                    // Mark sent now so we never duplicate
                    sentSessionRef.current = answerCapture.answerSessionId;

                    const t0 = performance.now();
                    const dataBase64 = await blobToBase64(blob);
                    const t1 = performance.now();
                    console.log("base64 time:", (t1 - t0), "ms");

                    console.log("[mic] sending", {
                        bytes: blob.size,
                        mime: blob.type,
                        session: answerCapture.answerSessionId,
                    });

                    sendJson({
                        type: "answer-audio-blob",
                        gameId,
                        answerSessionId: answerCapture.answerSessionId,
                        mimeType: blob.type,
                        dataBase64,
                        vad: { hasSpoken: true, maxRms, voiceMs, durationMs },
                    });
                };

                // Start recording; collect chunks every 1000ms
                rec.start(1000);

                // Start VAD loop
                vadTimer = window.setTimeout(scheduleVadTick, VAD_INTERVAL_MS);

                // Hard stop: always stop a bit early to beat server window
                const BUFFER_MS = 800;
                const hardStopInMs = Math.max(500, (answerCapture.durationMs || 6500) - BUFFER_MS);

                window.setTimeout(() => {
                    try {
                        if (rec.state !== "inactive") rec.stop();
                    } catch {
                        // ignore
                    }
                }, hardStopInMs);
            } catch (err) {
                console.error("Mic capture failed:", err);

                // Cleanup if getUserMedia fails partway
                try {
                    stream?.getTracks().forEach((t) => t.stop());
                } catch {
                    /* ignore */
                }
                try {
                    source?.disconnect();
                } catch {
                    /* ignore */
                }
                try {
                    analyser?.disconnect();
                } catch {
                    /* ignore */
                }
                try {
                    await audioCtx?.close();
                } catch {
                    /* ignore */
                }

                // If mic fails, do nothing — backend timeout will mark incorrect
            }
        };

        void start();

        return () => {
            cancelled = true;

            try {
                const rec = recorderRef.current;
                if (rec && rec.state !== "inactive") rec.stop();
            } catch {
                // ignore
            }

            recorderRef.current = null;
            chunksRef.current = [];
        };
    }, [answerCapture, isAnsweringPlayer, gameId, sendJson]);

    useEffect(() => {
        if (localSelectedClue?.media?.type === "image") {
            const img = new Image();
            img.src = `/api/images/${localSelectedClue.media.assetId}`;
        }
    }, [localSelectedClue]);

    return (
        <div className="absolute inset-0 h-[calc(100vh-5.5rem)] text-white z-10 p-5">
            {/* Timer stays pinned */}
            <div className="absolute left-8 top-0">
                <Timer endTime={timerEndTime} duration={timerDuration} />
            </div>

            {/* Keep buzz animation overlay-ish */}
            <BuzzAnimation playerName={buzzResult} />

            {/* Main layout: top padding for timer + scrollable center area */}
            <div className="h-full pt-16 flex flex-col items-center">
                {/* Scroll container so long clues never run off-screen */}
                <div className="w-full flex-1 overflow-y-auto overscroll-contain flex justify-center">
                    <div className="text-center cursor-pointer w-full max-w-[85vw] md:max-w-[65vw] py-2">
                        {imageAssetId ? (
                            <div className="flex flex-col items-center gap-4 w-full">
                                <img
                                    src={`/api/images/${imageAssetId}`}
                                    alt="Visual clue"
                                    className="max-h-[45vh] max-w-[85vw] object-contain rounded-lg shadow-2xl border border-white/20"
                                    loading="eager"
                                    decoding="async"
                                    draggable={false}
                                    onError={(e) => {
                                        (e.currentTarget as HTMLImageElement).style.display = "none";
                                    }}
                                />

                                <p
                                    style={{ fontSize: "clamp(0.9rem, 1.8vw, 1.8rem)" }}
                                    className="mx-auto leading-snug break-words"
                                >
                                    {localSelectedClue.question.toUpperCase()}
                                </p>
                            </div>
                        ) : (
                            <h1
                                style={{ fontSize: "clamp(2rem, 3vw, 4rem)" }}
                                className="mb-1 mx-auto leading-snug break-words font-swiss911 text-shadow-jeopardy tracking-wider"
                            >
                                {localSelectedClue.question.toUpperCase()}
                            </h1>
                        )}

                        <div className="min-h-[70px] md:min-h-[100px] flex justify-center items-center font-swiss911 text-shadow-jeopardy tracking-wider">
                            {showAnswer && (
                                <p
                                    style={{ fontSize: "clamp(1.2rem, 3.2vw, 2.6rem)" }}
                                    className="mt-5 text-yellow-300 break-words"
                                >
                                    {localSelectedClue.answer.toUpperCase()}
                                </p>
                            )}
                        </div>

                        {isFinalJeopardy && (
                            <FinalJeopardyPanel
                                gameId={gameId}
                                currentPlayer={currentPlayer}
                                canvasRef={canvasRef}
                                drawings={drawings}
                                drawingSubmitted={drawingSubmitted}
                                setDrawingSubmitted={setDrawingSubmitted}
                                finalWagers={finalWagers}
                                selectedFinalist={selectedFinalist}
                                timerEndTime={timerEndTime}
                                showWager={showWager}
                                finalists={finalists}
                            />
                        )}
                        {answerProcessing && !showAnswer && (
                            <div className="mt-3 flex justify-center">
                                <div className="text-md text-red-500 font-extrabold mt-1">
                                    Server is thinking…
                                </div>
                            </div>
                        )}

                        {answerCapture && !showAnswer && (
                            <div className="mt-4 text-center">
                                <div className="text-lg font-bold">{answerCapture.playerName} is answering…</div>
                                {isAnsweringPlayer && (
                                    <div className="text-md text-red-500 font-extrabold mt-1">Recording your mic now…</div>
                                )}
                                {answerError && <div className="mt-2 text-sm text-red-200">{answerError}</div>}
                            </div>
                        )}
                    </div>
                </div>

                {/* Buzz button stays at the bottom */}
                {!isFinalJeopardy && !showDdModal && !showAnswer && (
                    <button
                        onClick={handleBuzz}
                        disabled={!!buzzResult || buzzLockedOut || !!answerCapture}
                        style={{ fontSize: "clamp(1.5rem, 3vw, 2.5rem)" }}
                        className={`mt-4 px-12 py-5 rounded-xl font-bold shadow-2xl min-w-64 intext-white transition duration-300 ease-in-out ${
                            buzzLockedOut
                                ? "bg-orange-500"
                                : buzzResult || buzzerLocked
                                    ? "bg-gray-500 cursor-not-allowed"
                                    : "bg-green-500 hover:bg-green-600"
                        }`}
                    >
                        {buzzLockedOut ? "Locked Out" : buzzerLocked ? "Buzz Early" : "Buzz!"}
                    </button>
                )}
            </div>
        </div>
    );

};

export default SelectedClueDisplay;

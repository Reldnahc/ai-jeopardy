import React, {useEffect} from "react";
import { ReactSketchCanvas } from "react-sketch-canvas";
import { Clue } from "../../types.ts";
import { useWebSocket } from "../../contexts/WebSocketContext.tsx";
import { Player } from "../../types/Lobby.ts";
import {useDeviceContext} from "../../contexts/DeviceContext.tsx";
import BuzzAnimation from "./BuzzAnimation.tsx";
import Timer from "./Timer.tsx";

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
                                                                     effectivePlayerName
                                                                 }) => {
    const { sendJson } = useWebSocket();
    const {deviceType} = useDeviceContext();
    const imageAssetId =
        localSelectedClue?.media?.type === "image"
            ? localSelectedClue.media.assetId
            : null;

    const recorderRef = React.useRef<MediaRecorder | null>(null);
    const chunksRef = React.useRef<BlobPart[]>([]);
    const sentSessionRef = React.useRef<string | null>(null);

    async function blobToBase64(blob: Blob): Promise<string> {
        const ab = await blob.arrayBuffer();
        const bytes = new Uint8Array(ab);
        let binary = "";
        const chunkSize = 0x8000;
        for (let i = 0; i < bytes.length; i += chunkSize) {
            binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
        }
        return btoa(binary);
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
                        echoCancellation: true,
                        noiseSuppression: true,
                        autoGainControl: true,
                    },
                });

                const mime = pickMimeType();

                chunksRef.current = [];
                const rec = new MediaRecorder(stream, mime ? {
                    mimeType: mime,
                    audioBitsPerSecond: 8000,   // try 16000–32000
                    bitsPerSecond: 8000,
                } : {
                    audioBitsPerSecond: 8000,
                    bitsPerSecond: 8000,
                });
                recorderRef.current = rec;

                // --- VAD setup (detect when they've spoken, then stop after silence) ---
                const END_SILENCE_MS = 900;     // stop after this much silence *after speech*
                const VAD_INTERVAL_MS = 80;     // how often to sample audio
                const RMS_THRESHOLD = 0.018;    // tweak: lower = more sensitive, higher = less sensitive

                audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
                source = audioCtx.createMediaStreamSource(stream);
                analyser = audioCtx.createAnalyser();
                analyser.fftSize = 2048;
                source.connect(analyser);

                const data = new Float32Array(analyser.fftSize);

                let hasSpoken = false;
                let lastVoiceAt = 0;

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
                    try { source?.disconnect(); } catch { /* ignore */ }
                    try { analyser?.disconnect(); } catch { /* ignore */ }
                    try { await audioCtx?.close(); } catch { /* ignore */ }

                    // Stop tracks
                    try {
                        stream?.getTracks().forEach((t) => t.stop());
                    } catch {
                        // ignore
                    }

                    if (cancelled) return;

                    const blob = new Blob(chunksRef.current, { type: rec.mimeType || "audio/webm" });
                    chunksRef.current = [];

                    // Mark sent now so we never duplicate
                    sentSessionRef.current = answerCapture.answerSessionId;

                    const dataBase64 = await blobToBase64(blob);

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
                    });
                };

                // Start recording; collect chunks every 250ms
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
                try { stream?.getTracks().forEach((t) => t.stop()); } catch { /* ignore */ }
                try { source?.disconnect(); } catch { /* ignore */ }
                try { analyser?.disconnect(); } catch { /* ignore */ }
                try { await audioCtx?.close(); } catch { /* ignore */ }

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
        <div className="absolute inset-0 h-[calc(100vh-5.5rem)] text-white flex flex-col justify-center items-center z-10 p-5">
            <div className="absolute left-8 top-0 ">
                <Timer endTime={timerEndTime} duration={timerDuration} />
            </div>
                <BuzzAnimation playerName={buzzResult} />

                <div className="text-center cursor-pointer w-full">
                    {imageAssetId ? (
                        <div className="flex flex-col items-center gap-4 w-full">
                            <img
                                src={`/api/images/${imageAssetId}`}
                                alt="Visual clue"
                                className="max-h-[55vh] max-w-[85vw] object-contain rounded-lg shadow-2xl border border-white/20"
                                loading="eager"
                                decoding="async"
                                draggable={false}
                                onError={(e) => {
                                    // Fail-soft: hide broken image if something goes wrong
                                    (e.currentTarget as HTMLImageElement).style.display = "none";
                                }}
                            />

                            {/* Clue text below image, smaller than normal */}
                            <p
                                style={{ fontSize: "clamp(0.9rem, 2vw, 2rem)" }}
                                className="md:max-w-[65vw] mx-auto leading-snug"
                            >
                                {localSelectedClue.question}
                            </p>
                        </div>
                    ) : (
                        <h1
                            style={{ fontSize: "clamp(0.75rem, 3vw, 4rem)" }}
                            className="mb-1 md:max-w-[65vw] mx-auto"
                        >
                            {localSelectedClue.question}
                        </h1>
                    )}

                    {/* Reserve space for the answer */}
                {(isFinalJeopardy ? (
                        <div className="flex justify-center items-center">
                            {(showAnswer) && (
                                <p style={{ fontSize: "clamp(1.5rem, 4vw, 3rem)" }} className="mt-5 text-yellow-300">
                                    {localSelectedClue.answer}
                                </p>
                            )}
                        </div>
                    ):(
                        <div className="sm:min-h-[70px] md:min-h-[100px] flex justify-center items-center">
                            {(showAnswer) && (
                                <p style={{ fontSize: "clamp(1.5rem, 4vw, 3rem)" }} className="mt-5 text-yellow-300">
                                    {localSelectedClue.answer}
                                </p>
                            )}
                        </div>
                ))}

                {isFinalJeopardy && drawingSubmitted[currentPlayer] && !drawings && (
                    <p style={{ fontSize: "clamp(1rem, 2vw, 1.5rem)" }}>
                        Answer Submitted, waiting for others...
                    </p>
                )}

                {isFinalJeopardy && !drawingSubmitted[currentPlayer] && (
                    <div className="flex flex-col items-center justify-center w-full text-white p-5">
                        <h2 style={{ fontSize: "clamp(1.5rem, 3vw, 2.5rem)" }} className="mb-5">
                            Write Your Answer
                        </h2>

                        <div className="flex items-start gap-4">
                            {( deviceType === 'mobile' ? (
                                    <ReactSketchCanvas
                                        ref={canvasRef}
                                        className="border-2 border-white rounded-lg bg-white"
                                        width="60vw"
                                        height="25vh"
                                        strokeWidth={4}
                                        strokeColor="black"
                                    />
                                ):(
                                    <ReactSketchCanvas
                                        ref={canvasRef}
                                        className="border-2 border-white rounded-lg bg-white"
                                        width="600px"
                                        height="250px"
                                        strokeWidth={4}
                                        strokeColor="black"
                                    />
                                )
                            )}

                            <div className="flex flex-col gap-3">
                                {/* Clear Canvas */}
                                <button
                                    onClick={() => canvasRef.current?.clearCanvas()}
                                    className="px-5 py-2 rounded-lg bg-red-500 text-white cursor-pointer
                             hover:bg-red-600 transition-colors duration-200 shadow-lg"
                                >
                                    Clear
                                </button>

                                {/* Submit Drawing */}
                                <button
                                    onClick={() => {
                                        canvasRef.current?.exportImage("png").then((pngDataUrl: string) => {
                                            sendJson({
                                                type: "submit-drawing",
                                                gameId,
                                                player: currentPlayer,
                                                drawing: pngDataUrl,
                                            });

                                            setDrawingSubmitted((prev) => ({
                                                ...prev,
                                                [currentPlayer]: true,
                                            }));
                                        });
                                    }}
                                    className="px-5 py-2 rounded-lg bg-blue-500 text-white cursor-pointer
                             hover:bg-blue-600 transition-colors duration-200 shadow-lg"
                                >
                                    Submit
                                </button>
                            </div>
                        </div>
                    </div>
                )}
                    {answerCapture && !showAnswer && (
                        <div className="mt-4 text-center">
                            <div className="text-lg font-bold">
                                {answerCapture.playerName} is answering…
                            </div>
                            {isAnsweringPlayer && (
                                <div className="text-sm opacity-80 mt-1">Recording your mic now…</div>
                            )}
                            {answerError && (
                                <div className="mt-2 text-sm text-red-200">{answerError}</div>
                            )}
                        </div>
                    )}

                {!isFinalJeopardy && !showAnswer && (
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

                <div className="flex flex-wrap gap-4">
                    {drawings &&
                        !Array.isArray(drawings) &&
                        Object.entries(drawings).map(([player, pngDataUrl]) => (
                            <div key={player} className="mb-5 z-0 w-auto">
                                <div className="flex flex-col items-center">
                                    {/* Customize avatar display */}
                                    <h2
                                        style={{ fontSize: "clamp(1rem, 2vw, 1.5rem)" }}
                                        className="text-center font-semibold mb-2"
                                    >
                                        {player}'s answer:
                                    </h2>
                                    <img
                                        src={pngDataUrl}
                                        alt={`${player} final jeopardy answer`}
                                        className="max-h-[35vh] max-w-[45vw] object-contain rounded-lg shadow-2xl border border-white/20 bg-white"
                                        loading="lazy"
                                        decoding="async"
                                        draggable={false}
                                        onError={(e) => {
                                            (e.currentTarget as HTMLImageElement).style.display = "none";
                                        }}
                                    />
                                </div>
                            </div>
                        ))}
                </div>
            </div>
        </div>
    );
};

export default SelectedClueDisplay;

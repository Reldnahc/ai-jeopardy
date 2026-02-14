import {useEffect, useRef, useState} from "react";
import { useWebSocket } from "../../contexts/WebSocketContext.tsx";
import Timer from "./Timer.tsx";
import {DailyDoubleShowModalMsg, DailyDoubleWagerCaptureStartMsg} from "../../hooks/game/useGameSocketSync.ts";


type Props = {
    gameId: string;
    effectivePlayerName: string | null;
    ddWagerCapture: DailyDoubleWagerCaptureStartMsg | null;
    showDdModal: DailyDoubleShowModalMsg | null;
    ddWagerError: string | null;
    timerEndTime: number | null;
    timerDuration: number;
};

function pickMimeType(): string {
    const preferred = "audio/webm;codecs=opus";
    if (typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(preferred)) return preferred;
    if (typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported("audio/webm")) return "audio/webm";
    return "";
}

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


export default function DailyDoubleWagerOverlay({
                                                    gameId,
                                                    effectivePlayerName,
                                                    ddWagerCapture,
                                                    ddWagerError,
                                                    timerEndTime,
                                                    timerDuration,
                                                    showDdModal
                                                }: Props) {
    const { sendJson } = useWebSocket();

    const recorderRef = useRef<MediaRecorder | null>(null);
    const chunksRef = useRef<BlobPart[]>([]);
    const sentDdSessionRef = useRef<string | null>(null);
    const [isRecording, setIsRecording] = useState(false);
    const isDdWagerPlayer =
        !!effectivePlayerName && ddWagerCapture?.playerName === effectivePlayerName;

    useEffect(() => {
        if (!isDdWagerPlayer) return;

        // Don’t resend for same session
        if (sentDdSessionRef.current === ddWagerCapture?.ddWagerSessionId) return;

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
                        ? { mimeType: mime, audioBitsPerSecond: 24000, bitsPerSecond: 24000 }
                        : { audioBitsPerSecond: 24000, bitsPerSecond: 24000 }
                );

                recorderRef.current = rec;

                // --- VAD ---
                const END_SILENCE_MS = 900;
                const VAD_INTERVAL_MS = 80;
                const RMS_THRESHOLD = 0.018;

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

                    if (hasSpoken && now - lastVoiceAt >= END_SILENCE_MS) {
                        if (rec.state !== "inactive") rec.stop();
                        return;
                    }

                    vadTimer = window.setTimeout(scheduleVadTick, VAD_INTERVAL_MS);
                };

                rec.ondataavailable = (e) => {
                    if (e.data && e.data.size > 0) chunksRef.current.push(e.data);
                };

                rec.onstop = async () => {
                    if (vadTimer) window.clearTimeout(vadTimer);
                    setIsRecording(false);
                    source?.disconnect();
                    analyser?.disconnect();
                    await audioCtx?.close();
                    stream?.getTracks().forEach((t) => t.stop());

                    if (cancelled) return;

                    // If they said nothing, just let them try again (don’t send empty base64)
                    if (!hasSpoken) {
                        sentDdSessionRef.current = ddWagerCapture?.ddWagerSessionId ?? null;
                        return;
                    }

                    const blob = new Blob(chunksRef.current, { type: rec.mimeType || "audio/webm" });
                    chunksRef.current = [];

                    sentDdSessionRef.current = ddWagerCapture?.ddWagerSessionId ?? null;

                    const dataBase64 = await blobToBase64(blob);

                    sendJson({
                        type: "daily-double-wager-audio-blob",
                        gameId,
                        ddWagerSessionId: ddWagerCapture?.ddWagerSessionId,
                        mimeType: blob.type,
                        dataBase64,
                    });
                };

                rec.start(1000);
                setIsRecording(true);
                vadTimer = window.setTimeout(scheduleVadTick, VAD_INTERVAL_MS);

                const BUFFER_MS = 800;
                const hardStopInMs = Math.max(
                    500,
                    (ddWagerCapture?.durationMs || 6500) - BUFFER_MS
                );

                window.setTimeout(() => {
                    if (rec.state !== "inactive") rec.stop();
                }, hardStopInMs);
            } catch (err) {
                console.error("DD wager mic capture failed:", err);

                stream?.getTracks().forEach((t) => t.stop());
                source?.disconnect();
                analyser?.disconnect();
                await audioCtx?.close()
            }
        };

        void start();

        return () => {
            cancelled = true;

            const rec = recorderRef.current;
            if (rec && rec.state !== "inactive") rec.stop();
            setIsRecording(false);
            recorderRef.current = null;
            chunksRef.current = [];
        };
    }, [ddWagerCapture?.ddWagerSessionId, ddWagerCapture?.durationMs, gameId, isDdWagerPlayer, sendJson]);

    return (
        <div className="absolute inset-0 z-20 flex items-center justify-center bg-black/85">
            <div className="absolute left-8 top-0 ">
                <Timer endTime={timerEndTime} duration={timerDuration} />
            </div>

            <div className="w-[min(820px,94vw)] rounded-3xl bg-blue-950 p-12 text-white shadow-2xl">
                <div className="text-6xl font-extrabold text-yellow-400 font-swiss911 text-shadow-jeopardy tracking-wider">
                    Daily Double!
                </div>

                <div className="mt-6 text-2xl">
                <span className="font-bold">
                    {showDdModal?.playerName}
                </span>{" "}
                    must wager (max{" "}
                    <span className="font-bold">
                    ${showDdModal?.maxWager.toLocaleString()}
                </span>
                    )
                </div>

                {isDdWagerPlayer && isRecording ? (
                    <div className="mt-6 text-lg text-red-500 font-semibold">
                        Recording your wager now… say a number (or “true daily double”).
                    </div>
                ) : isDdWagerPlayer ? (
                    <div className="mt-6 text-lg opacity-80">
                        Waiting for host...
                    </div>
                ) : (
                    <div className="mt-6 text-lg opacity-80">
                        Please wait...
                    </div>
                )}

                {/* Reserve space for error (prevents layout jump) */}
                <div
                    className={[
                        "mt-6 text-lg font-medium transition-opacity",
                        "min-h-[28px]", // ~ one line at text-lg
                        ddWagerError ? "opacity-100 text-red-300" : "opacity-0",
                    ].join(" ")}
                    aria-live="polite"
                >
                    {ddWagerError || "\u00A0"}
                </div>

            </div>
        </div>
    );

}

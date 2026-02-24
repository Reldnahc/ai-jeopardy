import React, { useEffect } from "react";
import { Clue } from "../../../../shared/types/board.ts";
import { useWebSocket } from "../../../contexts/WebSocketContext.tsx";
import BuzzAnimation from "./BuzzAnimation.tsx";
import Timer from "./Timer.tsx";
import FinalJeopardyPanel from "./FinalJeopardyPanel.tsx";
import type {
  AnswerUiState,
  BuzzUiState,
  DailyDoubleUiState,
  FinalUiState,
  TimerUiState,
} from "./gameViewModels.ts";

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
  buzzUi: BuzzUiState;
  timerUi: TimerUiState;
  answerUi: AnswerUiState;
  finalUi: FinalUiState;
  ddUi: DailyDoubleUiState;
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
  buzzUi,
  timerUi,
  answerUi,
  finalUi,
  ddUi,
}) => {
  const { sendJson } = useWebSocket();

  function createAudioContext(): AudioContext {
    const ctor =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!ctor) throw new Error("AudioContext not supported");
    return new ctor();
  }

  const imageAssetId =
    localSelectedClue?.media?.type === "image" ? localSelectedClue.media.assetId : null;

  const recorderRef = React.useRef<MediaRecorder | null>(null);
  const chunksRef = React.useRef<BlobPart[]>([]);
  const sentSessionRef = React.useRef<string | null>(null);

  function blobToBase64(blob: Blob): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = () => reject(reader.error);
      reader.onloadend = () => {
        const result = String(reader.result || "");
        const base64 = result.split(",")[1] || "";
        resolve(base64);
      };
      reader.readAsDataURL(blob);
    });
  }

  function pickMimeType(): string {
    const preferred = "audio/webm;codecs=opus";
    if (typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(preferred))
      return preferred;
    if (typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported("audio/webm"))
      return "audio/webm";
    return "";
  }

  const isAnsweringPlayer =
    !!answerUi.answerCapture &&
    !!answerUi.myUsername &&
    answerUi.answerCapture.username === answerUi.myUsername;

  useEffect(() => {
    const capture = answerUi.answerCapture;
    if (!capture || !isAnsweringPlayer) return;

    if (sentSessionRef.current === capture.answerSessionId) return;

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
                audioBitsPerSecond: 24000,
                bitsPerSecond: 24000,
              }
            : {
                audioBitsPerSecond: 24000,
                bitsPerSecond: 24000,
              },
        );
        recorderRef.current = rec;

        const END_SILENCE_MS = 900;
        const VAD_INTERVAL_MS = 80;
        const RMS_THRESHOLD = 0.018;

        audioCtx = createAudioContext();
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
          if (vadTimer) {
            window.clearTimeout(vadTimer);
            vadTimer = null;
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
            sentSessionRef.current = capture.answerSessionId;

            console.log("[mic] no speech detected, sending noSpeech", {
              session: capture.answerSessionId,
              durationMs,
              maxRms,
            });

            sendJson({
              type: "answer-audio-blob",
              gameId,
              answerSessionId: capture.answerSessionId,
              mimeType: rec.mimeType || "audio/webm",
              noSpeech: true,
              vad: { hasSpoken: false, maxRms, voiceMs, durationMs },
              dataBase64: "",
            });

            return;
          }

          const blob = new Blob(chunksRef.current, { type: rec.mimeType || "audio/webm" });
          chunksRef.current = [];

          sentSessionRef.current = capture.answerSessionId;

          const t0 = performance.now();
          const dataBase64 = await blobToBase64(blob);
          const t1 = performance.now();
          console.log("base64 time:", t1 - t0, "ms");

          console.log("[mic] sending", {
            bytes: blob.size,
            mime: blob.type,
            session: capture.answerSessionId,
          });

          sendJson({
            type: "answer-audio-blob",
            gameId,
            answerSessionId: capture.answerSessionId,
            mimeType: blob.type,
            dataBase64,
            vad: { hasSpoken: true, maxRms, voiceMs, durationMs },
          });
        };

        rec.start(1000);
        vadTimer = window.setTimeout(scheduleVadTick, VAD_INTERVAL_MS);

        const BUFFER_MS = 800;
        const hardStopInMs = Math.max(500, (capture.durationMs || 6500) - BUFFER_MS);

        window.setTimeout(() => {
          try {
            if (rec.state !== "inactive") rec.stop();
          } catch {
            // ignore
          }
        }, hardStopInMs);
      } catch (err) {
        console.error("Mic capture failed:", err);

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
  }, [answerUi.answerCapture, isAnsweringPlayer, gameId, sendJson]);

  useEffect(() => {
    if (localSelectedClue?.media?.type === "image") {
      const img = new Image();
      img.src = `/api/images/${localSelectedClue.media.assetId}`;
    }
  }, [localSelectedClue]);

  return (
    <div className="absolute inset-0 h-[calc(100vh-5.5rem)] text-white z-10 p-5">
      <div className="absolute left-8 top-0">
        <Timer endTime={timerUi.timerEndTime} duration={timerUi.timerDuration} />
      </div>

      <BuzzAnimation playerName={buzzUi.buzzResultDisplay} />

      <div className="h-full pt-16 flex flex-col items-center">
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
                finalWagers={finalUi.finalWagers}
                finalWagerDrawings={finalUi.finalWagerDrawings}
                selectedFinalist={finalUi.selectedFinalist}
                timerEndTime={timerUi.timerEndTime}
                showWager={finalUi.showWager}
                finalists={finalUi.finalists}
              />
            )}
            {answerUi.answerProcessing && !showAnswer && (
              <div className="mt-3 flex justify-center">
                <div className="text-md text-red-500 font-extrabold mt-1">Host is thinking…</div>
              </div>
            )}

            {answerUi.answerCapture && !showAnswer && (
              <div className="mt-4 text-center">
                <div className="text-lg font-bold">{answerUi.answerCapture.displayname} is answering…</div>
                {isAnsweringPlayer && (
                  <div className="text-md text-red-500 font-extrabold mt-1">Recording your mic now…</div>
                )}
                {answerUi.answerError && (
                  <div className="mt-2 text-sm text-red-200">{answerUi.answerError}</div>
                )}
              </div>
            )}
          </div>
        </div>

        {!isFinalJeopardy && !ddUi.showDdModal && !showAnswer && !buzzUi.hasBuzzedCurrentClue && (
          <button
            onClick={handleBuzz}
            disabled={!!buzzUi.buzzResult || buzzUi.buzzLockedOut || !!answerUi.answerCapture}
            style={{ fontSize: "clamp(1.5rem, 3vw, 2.5rem)" }}
            className={`mt-4 px-12 py-5 rounded-xl font-bold shadow-2xl min-w-64 intext-white transition duration-300 ease-in-out ${
              buzzUi.buzzLockedOut
                ? "bg-orange-500"
                : buzzUi.buzzResult || buzzUi.buzzerLocked
                  ? "bg-gray-500 cursor-not-allowed"
                  : "bg-green-500 hover:bg-green-600"
            }`}
          >
            {buzzUi.buzzLockedOut ? "Locked Out" : buzzUi.buzzerLocked ? "Buzz Early" : "Buzz!"}
          </button>
        )}
      </div>
    </div>
  );
};

export default SelectedClueDisplay;


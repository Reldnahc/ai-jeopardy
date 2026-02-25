import React, { useEffect } from "react";
import { Clue } from "../../../../shared/types/board.ts";
import { useWebSocket } from "../../../contexts/WebSocketContext.tsx";
import BuzzAnimation from "./BuzzAnimation.tsx";
import Timer from "./Timer.tsx";
import FinalJeopardyPanel from "./FinalJeopardyPanel.tsx";
import { blobToBase64, useVadAudioCapture } from "./useVadAudioCapture.ts";
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

  const imageAssetId =
    localSelectedClue?.media?.type === "image" ? localSelectedClue.media.assetId : null;

  const isAnsweringPlayer =
    !!answerUi.answerCapture &&
    !!answerUi.myUsername &&
    answerUi.answerCapture.username === answerUi.myUsername;

  const answerSessionId = answerUi.answerCapture?.answerSessionId ?? null;

  const { isRecording } = useVadAudioCapture({
    enabled: isAnsweringPlayer,
    sessionId: answerSessionId,
    durationMs: answerUi.answerCapture?.durationMs,
    onCaptureComplete: async ({ blob, vad }) => {
      if (!answerSessionId) return;

      const t0 = performance.now();
      const dataBase64 = await blobToBase64(blob);
      const t1 = performance.now();
      console.log("base64 time:", t1 - t0, "ms");

      console.log("[mic] sending", {
        bytes: blob.size,
        mime: blob.type,
        session: answerSessionId,
      });

      sendJson({
        type: "answer-audio-blob",
        gameId,
        answerSessionId,
        mimeType: blob.type,
        dataBase64,
        vad,
      });
    },
    onNoSpeech: ({ mimeType, vad }) => {
      if (!answerSessionId) return;

      console.log("[mic] no speech detected, sending noSpeech", {
        session: answerSessionId,
        durationMs: vad.durationMs,
        maxRms: vad.maxRms,
      });

      sendJson({
        type: "answer-audio-blob",
        gameId,
        answerSessionId,
        mimeType,
        noSpeech: true,
        vad,
        dataBase64: "",
      });
    },
    onError: (err) => {
      console.error("Mic capture failed:", err);
    },
  });

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
                <div className="text-lg font-bold">
                  {answerUi.answerCapture.displayname} is answering…
                </div>
                {isAnsweringPlayer && isRecording && (
                  <div className="text-md text-red-500 font-extrabold mt-1">
                    Recording your mic now…
                  </div>
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

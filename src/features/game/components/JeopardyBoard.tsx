import React, { useCallback, useEffect, useRef, useState } from "react";
import { Category, Clue } from "../../../../shared/types/board.ts";
import { ReactSketchCanvas } from "react-sketch-canvas";
import JeopardyGrid from "./JeopardyGrid.tsx"; // Import the grid component
import SelectedClueDisplay from "./SelectedClueDisplay.tsx";
import { useWebSocket } from "../../../contexts/WebSocketContext.tsx";
import { Player } from "../../../types/Lobby.ts";
import DailyDoubleWagerOverlay from "./DailyDoubleWagerOverlay.tsx";
import { useDeviceContext } from "../../../contexts/DeviceContext.tsx";
import type {
  AnswerUiState,
  BuzzUiState,
  DailyDoubleUiState,
  FinalUiState,
  TimerUiState,
} from "./gameViewModels.ts";
import Timer from "./Timer.tsx"; // Import the selected clue component

interface JeopardyBoardProps {
  boardData: Category[];
  canSelectClue: boolean;
  onClueSelected: (clue: Clue) => void;
  selectedClue: Clue | null;
  gameId: string;
  clearedClues: Set<string>; // Add clearedClues
  players: Player[]; // Prop to track players in the game
  scores: Record<string, number>; // Player scores
  currentPlayer: string; // New prop for the current player
  allWagersSubmitted: boolean;
  isFinalJeopardy: boolean;
  drawings: Record<string, string> | null;
  handleBuzz: () => void;
  buzzUi: BuzzUiState;
  timerUi: TimerUiState;
  answerUi: AnswerUiState;
  finalUi: FinalUiState;
  ddUi: DailyDoubleUiState;
}

const JeopardyBoard: React.FC<JeopardyBoardProps> = ({
  boardData,
  canSelectClue,
  onClueSelected,
  selectedClue,
  gameId,
  clearedClues,
  players,
  scores,
  currentPlayer,
  allWagersSubmitted,
  isFinalJeopardy,
  drawings,
  handleBuzz,
  buzzUi,
  timerUi,
  answerUi,
  finalUi,
  ddUi,
}) => {
  const [localSelectedClue, setLocalSelectedClue] = useState<Clue | null>(null);
  const [showClue, setShowClue] = useState(false);
  const [wagerDrawingSubmitted, setWagerDrawingSubmitted] = useState<Record<string, boolean>>({});
  const [drawingSubmitted, setDrawingSubmitted] = useState<Record<string, boolean>>({});
  const { sendJson, nowMs } = useWebSocket();
  const { deviceType } = useDeviceContext();
  const showAnswer = Boolean(localSelectedClue?.showAnswer);

  // @ts-expect-error works better this way
  const canvasRef = useRef<ReactSketchCanvas>(null);
  const canvas_with_mask = document.querySelector("#react-sketch-canvas__stroke-group-0");
  if (canvas_with_mask) canvas_with_mask.removeAttribute("mask");

  useEffect(() => {
    if (selectedClue) {
      setLocalSelectedClue(selectedClue);
      setShowClue(true);
    } else {
      setLocalSelectedClue(null);
      setShowClue(false);
    }
  }, [selectedClue, canSelectClue, players]);

  const handleClueClick = (clue: Clue, clueId: string) => {
    console.log(localSelectedClue);
    if (canSelectClue && clue && !localSelectedClue && !clearedClues.has(clueId)) {
      onClueSelected(clue);
    }
  };

  const exportWagerDrawing = useCallback(async (): Promise<string> => {
    const pngDataUrl = await canvasRef.current?.exportImage("png");
    if (typeof pngDataUrl === "string" && pngDataUrl.startsWith("data:image/")) {
      return pngDataUrl;
    }

    try {
      const svgData = await canvasRef.current?.exportSvg();
      if (typeof svgData === "string" && svgData.trim()) {
        const svgBase64 = window.btoa(unescape(encodeURIComponent(svgData)));
        return `data:image/svg+xml;base64,${svgBase64}`;
      }
    } catch {
      // ignore, fall through to empty
    }

    return "";
  }, []);

  const submitWagerDrawing = useCallback(async () => {
    let drawing = "";
    try {
      drawing = await exportWagerDrawing();
    } catch {
      drawing = "";
    } finally {
      sendJson({
        type: "submit-final-wager-drawing",
        gameId,
        player: currentPlayer,
        drawing,
      });
      setWagerDrawingSubmitted((prev) => ({ ...prev, [currentPlayer]: true }));
    }
  }, [currentPlayer, exportWagerDrawing, gameId, sendJson]);

  useEffect(() => {
    if (!isFinalJeopardy || allWagersSubmitted) return;
    if (!timerUi.timerEndTime) return;
    if (!finalUi.finalists.includes(currentPlayer)) return;
    if (wagerDrawingSubmitted[currentPlayer]) return;

    const BUFFER_MS = 200;
    const msUntil = Math.max(0, timerUi.timerEndTime - nowMs() - BUFFER_MS);
    const t = window.setTimeout(() => {
      if (!wagerDrawingSubmitted[currentPlayer]) {
        void submitWagerDrawing();
      }
    }, msUntil);

    return () => window.clearTimeout(t);
  }, [
    allWagersSubmitted,
    currentPlayer,
    finalUi.finalists,
    isFinalJeopardy,
    nowMs,
    submitWagerDrawing,
    timerUi.timerEndTime,
    wagerDrawingSubmitted,
  ]);

  if (!boardData || boardData.length === 0) {
    return <p>No board data available.</p>; // Handle invalid board data
  }

  const isFinalist = finalUi.finalists.includes(currentPlayer);
  const hasSubmittedWager = Boolean(wagerDrawingSubmitted[currentPlayer]);

  return (
    <div className="relative w-full h-full m-0 overflow-hidden">
      {isFinalJeopardy && !allWagersSubmitted && (
        <div className="flex flex-col items-center justify-center w-full h-full bg-gray-800 text-white">
          <h2 className="text-2xl">Final Jeopardy Category:</h2>
          <h1 className="text-6xl">{boardData[0].category}</h1>

          <div className="mt-6">
            <Timer endTime={timerUi.timerEndTime} duration={timerUi.timerDuration} />
          </div>

          <h2 className="text-2xl mt-6">Write Your Wager</h2>

          {!isFinalist && (
            <p className="mt-2 text-lg text-white/85">Waiting for finalists to submit wagers...</p>
          )}

          {isFinalist && hasSubmittedWager && (
            <p className="mt-2 text-lg text-white/85">Wager submitted. Waiting for others...</p>
          )}

          {isFinalist && !hasSubmittedWager && (
            <>
              <p className="mt-2 mb-4 text-sm text-white/80">
                Max wager: ${Math.max(0, Math.floor(Number(scores[currentPlayer] ?? 0))).toLocaleString()}
              </p>

              <div className="flex items-start gap-4">
                <ReactSketchCanvas
                  ref={canvasRef}
                  className="border-2 border-white rounded-lg bg-white"
                  width={deviceType === "mobile" ? "60vw" : "600px"}
                  height="180px"
                  strokeWidth={4}
                  strokeColor="black"
                />

                <div className="flex flex-col gap-3">
                  <button
                    onClick={() => canvasRef.current?.clearCanvas()}
                    className="px-5 py-2 rounded-lg bg-red-500 text-white cursor-pointer hover:bg-red-600 transition-colors duration-200 shadow-lg"
                  >
                    Clear
                  </button>

                  <button
                    onClick={() => void submitWagerDrawing()}
                    className="px-5 py-2 rounded-lg bg-blue-500 text-white cursor-pointer hover:bg-blue-600 transition-colors duration-200 shadow-lg"
                  >
                    Submit
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      )}

      {ddUi.showDdModal && !isFinalJeopardy && !showClue && (
        <DailyDoubleWagerOverlay
          gameId={gameId}
          myUsername={answerUi.myUsername}
          ddWagerCapture={ddUi.ddWagerCapture}
          showDdModal={ddUi.showDdModal}
          ddWagerError={ddUi.ddWagerError}
          timerEndTime={timerUi.timerEndTime}
          timerDuration={timerUi.timerDuration}
        />
      )}

      {/* Jeopardy Board */}
      {!showClue && !isFinalJeopardy && (
        <JeopardyGrid
          boardData={boardData}
          isHost={canSelectClue}
          clearedClues={clearedClues}
          handleClueClick={handleClueClick}
          isFinalJeopardy={isFinalJeopardy}
        />
      )}

      {/* Display Selected Clue */}
      {showClue && localSelectedClue && (
        <SelectedClueDisplay
          localSelectedClue={localSelectedClue}
          showAnswer={showAnswer}
          isFinalJeopardy={isFinalJeopardy}
          gameId={gameId}
          currentPlayer={currentPlayer}
          canvasRef={canvasRef}
          drawings={drawings}
          drawingSubmitted={drawingSubmitted}
          setDrawingSubmitted={setDrawingSubmitted}
          handleBuzz={handleBuzz}
          buzzUi={buzzUi}
          timerUi={timerUi}
          answerUi={answerUi}
          finalUi={finalUi}
          ddUi={ddUi}
        />
      )}
    </div>
  );
};

export default JeopardyBoard;

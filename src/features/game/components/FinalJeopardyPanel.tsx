// src/components/game/FinalJeopardyPanel.tsx
import React, { useEffect } from "react";
import { ReactSketchCanvas } from "react-sketch-canvas";
import { useWebSocket } from "../../../contexts/WebSocketContext.tsx";
import { useDeviceContext } from "../../../contexts/DeviceContext.tsx";

type FinalJeopardyPanelProps = {
  gameId: string;
  currentPlayer: string;
  // @ts-expect-error sketch type of issue
  canvasRef: React.RefObject<ReactSketchCanvas>;
  drawings: Record<string, string> | null;
  finalWagers: Record<string, number>;
  finalWagerDrawings: Record<string, string>;
  drawingSubmitted: Record<string, boolean>;
  setDrawingSubmitted: React.Dispatch<React.SetStateAction<Record<string, boolean>>>;
  selectedFinalist: string;
  showWager: boolean;
  timerEndTime: number | null;
  finalists: string[];
};

const FinalJeopardyPanel: React.FC<FinalJeopardyPanelProps> = ({
  gameId,
  currentPlayer,
  canvasRef,
  drawings,
  drawingSubmitted,
  setDrawingSubmitted,
  finalWagers,
  finalWagerDrawings,
  selectedFinalist,
  timerEndTime,
  showWager,
  finalists,
}) => {
  const { sendJson, nowMs } = useWebSocket();
  const { deviceType } = useDeviceContext();
  const hasSubmitted = !!drawingSubmitted[currentPlayer];
  const norm = (v: unknown) =>
    String(v ?? "")
      .trim()
      .toLowerCase();

  const shouldShowDrawings = !!drawings && !Array.isArray(drawings);
  const selectedFinalistNorm = norm(selectedFinalist);
  const selectedWagerDrawing =
    finalWagerDrawings?.[selectedFinalist] ??
    Object.entries(finalWagerDrawings || {}).find(([k]) => norm(k) === selectedFinalistNorm)?.[1] ??
    "";
  const selectedWagerValue =
    finalWagers?.[selectedFinalist] ??
    Object.entries(finalWagers || {}).find(([k]) => norm(k) === selectedFinalistNorm)?.[1] ??
    0;

  const submitNow = async () => {
    try {
      const pngDataUrl = await canvasRef.current?.exportImage("png");
      sendJson({
        type: "submit-drawing",
        gameId,
        player: currentPlayer,
        drawing: typeof pngDataUrl === "string" ? pngDataUrl : "",
      });
    } catch {
      sendJson({
        type: "submit-drawing",
        gameId,
        player: currentPlayer,
        drawing: "",
      });
    } finally {
      setDrawingSubmitted((prev) => ({ ...prev, [currentPlayer]: true }));
    }
  };

  // Auto-submit whatever is currently drawn when timer expires
  useEffect(() => {
    if (hasSubmitted) return;
    if (!timerEndTime) return;

    const BUFFER_MS = 200;
    const msUntil = Math.max(0, timerEndTime - nowMs() - BUFFER_MS);

    const t = window.setTimeout(() => {
      if (!hasSubmitted) {
        void submitNow();
      }
    }, msUntil);

    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [timerEndTime, hasSubmitted, currentPlayer]);

  const isFinalist = finalists.includes(currentPlayer);
  const canSubmitDrawing = isFinalist && !shouldShowDrawings && !!timerEndTime;

  return (
    <>
      {hasSubmitted && !drawings && (
        <p style={{ fontSize: "clamp(1rem, 2vw, 1.5rem)" }}>
          Answer Submitted, waiting for others...
        </p>
      )}

      {!hasSubmitted && canSubmitDrawing && (
        <div className="flex flex-col items-center justify-center w-full text-white p-5">
          <h2 style={{ fontSize: "clamp(1.5rem, 3vw, 2.5rem)" }} className="mb-5">
            Write Your Answer
          </h2>

          <div className="flex items-start gap-4">
            {deviceType === "mobile" ? (
              <ReactSketchCanvas
                ref={canvasRef}
                className="border-2 border-white rounded-lg bg-white"
                width="60vw"
                height="25vh"
                strokeWidth={4}
                strokeColor="black"
              />
            ) : (
              <ReactSketchCanvas
                ref={canvasRef}
                className="border-2 border-white rounded-lg bg-white"
                width="600px"
                height="250px"
                strokeWidth={4}
                strokeColor="black"
              />
            )}

            <div className="flex flex-col gap-3">
              <button
                onClick={() => canvasRef.current?.clearCanvas()}
                className="px-5 py-2 rounded-lg bg-red-500 text-white cursor-pointer hover:bg-red-600 transition-colors duration-200 shadow-lg"
              >
                Clear
              </button>

              <button
                onClick={() => void submitNow()}
                className="px-5 py-2 rounded-lg bg-blue-500 text-white cursor-pointer hover:bg-blue-600 transition-colors duration-200 shadow-lg"
              >
                Submit
              </button>
            </div>
          </div>
        </div>
      )}

      {shouldShowDrawings && (
        <div className="flex flex-wrap gap-4">
          {drawings && (
            <div className="flex flex-col items-center w-full">
              {selectedFinalist && (
                <div className="w-full flex flex-col items-center">
                  <h2
                    style={{ fontSize: "clamp(1rem, 2vw, 1.5rem)" }}
                    className="text-center font-semibold mb-2"
                  >
                    {selectedFinalist}&apos;s answer:
                  </h2>
                  {showWager && (
                    <div className="mb-3 flex flex-col items-center">
                      <div className="mb-2 text-center text-xl text-white/90">Wager:</div>
                      {selectedWagerDrawing ? (
                        <img
                          src={selectedWagerDrawing}
                          alt={`${selectedFinalist} final jeopardy wager`}
                          className="max-h-[20vh] max-w-[45vw] object-contain rounded-lg shadow-2xl border border-white/20 bg-white"
                          loading="lazy"
                          decoding="async"
                          draggable={false}
                          onError={(e) => {
                            (e.currentTarget as HTMLImageElement).style.display = "none";
                          }}
                        />
                      ) : (
                        <div className="text-center text-2xl text-white/90">
                          <span className="font-semibold">
                            ${Number(selectedWagerValue ?? 0).toLocaleString()}
                          </span>
                        </div>
                      )}
                    </div>
                  )}
                  {drawings[selectedFinalist] ? (
                    <img
                      src={drawings[selectedFinalist]}
                      alt={`${selectedFinalist} final jeopardy answer`}
                      className="max-h-[35vh] max-w-[45vw] object-contain rounded-lg shadow-2xl border border-white/20 bg-white"
                      loading="lazy"
                      decoding="async"
                      draggable={false}
                      onError={(e) => {
                        (e.currentTarget as HTMLImageElement).style.display = "none";
                      }}
                    />
                  ) : (
                    <div className="text-white/80">No answer submitted.</div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </>
  );
};

export default FinalJeopardyPanel;


// src/components/game/FinalJeopardyPanel.tsx
import React from "react";
import { ReactSketchCanvas } from "react-sketch-canvas";
import { useWebSocket } from "../../contexts/WebSocketContext.tsx";
import { useDeviceContext } from "../../contexts/DeviceContext.tsx";

type FinalJeopardyPanelProps = {
    gameId: string;
    currentPlayer: string;
    // @ts-expect-error sketch type of issue
    canvasRef: React.RefObject<ReactSketchCanvas>;
    drawings: Record<string, string> | null;
    finalWagers: Record<string, number>;
    drawingSubmitted: Record<string, boolean>;
    setDrawingSubmitted: React.Dispatch<React.SetStateAction<Record<string, boolean>>>;
    showAnswer: boolean;
    selectedFinalist: string;
};

const FinalJeopardyPanel: React.FC<FinalJeopardyPanelProps> = ({
                                                                    gameId,
                                                                    currentPlayer,
                                                                    canvasRef,
                                                                    drawings,
                                                                    drawingSubmitted,
                                                                    setDrawingSubmitted,
                                                                    showAnswer,
                                                                    finalWagers,
                                                                    selectedFinalist,
                                                               }) => {
    const { sendJson } = useWebSocket();
    const { deviceType } = useDeviceContext();
    const hasSubmitted = !!drawingSubmitted[currentPlayer];
    


    // Show other people's drawings once present (your existing behavior)
    const shouldShowDrawings = !!drawings && !Array.isArray(drawings);

    return (
        <>
            {/* Reserve space for the answer (Final Jeopardy uses a different layout in your file) */}
            <div className="flex justify-center items-center">
                {showAnswer && (
                    <p style={{ fontSize: "clamp(1.5rem, 4vw, 3rem)" }} className="mt-5 text-yellow-300">
                        {/* Answer text is rendered in parent to keep this panel purely "FJ mechanics" */}
                    </p>
                )}
            </div>

            {/* Waiting message once you've submitted and drawings haven't arrived yet */}
            {hasSubmitted && !drawings && (
                <p style={{ fontSize: "clamp(1rem, 2vw, 1.5rem)" }}>
                    Answer Submitted, waiting for others...
                </p>
            )}

            {/* Drawing canvas if not submitted yet */}
            {!hasSubmitted && (
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
                                className="px-5 py-2 rounded-lg bg-blue-500 text-white cursor-pointer hover:bg-blue-600 transition-colors duration-200 shadow-lg"
                            >
                                Submit
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Render drawings when they exist */}
            {shouldShowDrawings && (
                <div className="flex flex-wrap gap-4">
                    {showAnswer && drawings && (
                        <div className="flex flex-col items-center w-full">
                            {/* Spotlight */}
                            {selectedFinalist && (
                                <div className="w-full flex flex-col items-center">
                                    <h2
                                        style={{ fontSize: "clamp(1rem, 2vw, 1.5rem)" }}
                                        className="text-center font-semibold mb-2"
                                    >
                                        {selectedFinalist}&apos;s answer:
                                    </h2>

                                    {/* Wager under the answer */}
                                    <div className="mb-3 text-center text-white/90">
                                        Wager:{" "}
                                        <span className="font-semibold">
                                            ${Number(finalWagers?.[selectedFinalist] ?? 0).toLocaleString()}
                                        </span>
                                    </div>

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

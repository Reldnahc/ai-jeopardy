import React, {useEffect} from "react";
import { ReactSketchCanvas } from "react-sketch-canvas";
import { convertToSVG, DrawingPath } from "../../utils/drawingUtils.tsx";
import { Clue } from "../../types.ts";
import { useWebSocket } from "../../contexts/WebSocketContext.tsx";
import { Player } from "../../types/Lobby.ts";
import {useDeviceContext} from "../../contexts/DeviceContext.tsx";
import BuzzAnimation from "./BuzzAnimation.tsx";
import Timer from "./Timer.tsx";

interface SelectedClueDisplayProps {
    localSelectedClue: Clue;
    showAnswer: boolean;
    setShowAnswer: (value: boolean) => void;
    setShowClue: (value: boolean) => void;
    isHost: boolean;
    isFinalJeopardy: boolean;
    gameId: string;
    currentPlayer: string;
    // @ts-expect-error sketch type of issue
    canvasRef: React.RefObject<ReactSketchCanvas>;
    drawings: Record<string, DrawingPath[]> | null;
    drawingSubmitted: Record<string, boolean>;
    setDrawingSubmitted: React.Dispatch<React.SetStateAction<Record<string, boolean>>>;
    hostCanSeeAnswer: boolean;
    players: Player[];
    setBuzzerLocked: React.Dispatch<React.SetStateAction<boolean>>;
    setBuzzResult: React.Dispatch<React.SetStateAction<string | null>>;
    handleBuzz: () => void;
    buzzerLocked: boolean;
    buzzResult: string | null;
    buzzLockedOut: boolean;
    timerEndTime: number | null;
    timerDuration: number;
}

const SelectedClueDisplay: React.FC<SelectedClueDisplayProps> = ({
                                                                     localSelectedClue,
                                                                     showAnswer,
                                                                     setShowAnswer,
                                                                     setShowClue,
                                                                     isHost,
                                                                     isFinalJeopardy,
                                                                     gameId,
                                                                     currentPlayer,
                                                                     canvasRef,
                                                                     drawings,
                                                                     drawingSubmitted,
                                                                     setDrawingSubmitted,
                                                                     hostCanSeeAnswer,
                                                                     players,
                                                                     setBuzzerLocked,
                                                                     setBuzzResult,
                                                                     handleBuzz,
                                                                     buzzerLocked,
                                                                     buzzResult,
                                                                     buzzLockedOut,
                                                                     timerEndTime,
                                                                     timerDuration
                                                                 }) => {
    const { sendJson } = useWebSocket();
    const {deviceType} = useDeviceContext();
    const imageAssetId =
        localSelectedClue?.media?.type === "image"
            ? localSelectedClue.media.assetId
            : null;

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
                            {(showAnswer || hostCanSeeAnswer) && (
                                <p style={{ fontSize: "clamp(1.5rem, 4vw, 3rem)" }} className="mt-5 text-yellow-300">
                                    {localSelectedClue.answer}
                                </p>
                            )}
                        </div>
                    ):(
                        <div className="sm:min-h-[70px] md:min-h-[100px] flex justify-center items-center">
                            {(showAnswer || hostCanSeeAnswer) && (
                                <p style={{ fontSize: "clamp(1.5rem, 4vw, 3rem)" }} className="mt-5 text-yellow-300">
                                    {localSelectedClue.answer}
                                </p>
                            )}
                        </div>
                ))}

                {!isHost && isFinalJeopardy && drawingSubmitted[currentPlayer] && !drawings && (
                    <p style={{ fontSize: "clamp(1rem, 2vw, 1.5rem)" }}>
                        Answer Submitted, waiting for others...
                    </p>
                )}

                {(!isHost || players.length === 1) && isFinalJeopardy && !drawingSubmitted[currentPlayer] && (
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
                                        canvasRef.current?.exportPaths().then((paths: string) => {
                                            const drawingData = JSON.stringify(paths);

                                            sendJson({
                                                type: "final-jeopardy-drawing",
                                                gameId,
                                                player: currentPlayer,
                                                drawing: drawingData,
                                            });


                                            if (!drawingSubmitted[currentPlayer]) {
                                                setDrawingSubmitted((prev) => ({
                                                    ...prev,
                                                    [currentPlayer]: true,
                                                }));
                                            }
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

                {!isHost && !isFinalJeopardy && !showAnswer && (
                    <button
                        onClick={handleBuzz}
                        disabled={!!buzzResult || buzzLockedOut}
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
                {isHost && !(players.length === 1 && isHost) && !showAnswer && !isFinalJeopardy && (
                    <button
                        onClick={() => {
                            if (buzzerLocked) {
                                sendJson({ type: "unlock-buzzer", gameId });
                                setBuzzerLocked(false);
                            } else {
                                sendJson({ type: "reset-buzzer", gameId });
                                setBuzzResult(null);
                                setBuzzerLocked(true);
                            }

                        }}
                        style={{ fontSize: "clamp(1rem, 2.5vw, 2rem)" }}
                        className={`mt-4 mr-3 px-12 min-w-[22rem] py-5 rounded-xl font-bold shadow-2xl text-white transition duration-300 ease-in-out ${
                            buzzerLocked ? "bg-green-500 hover:bg-green-600" : buzzResult ? "bg-orange-500 hover:bg-orange-600" : "bg-gray-500"
                        } ${!buzzResult && !buzzerLocked ? "opacity-50 cursor-not-allowed" : ""}`}
                        disabled={!buzzResult && !buzzerLocked}
                    >
                        {buzzerLocked ? "Unlock Buzzer" : "Reset Buzzer"}
                    </button>
                )}
                {/* Button to reveal answer or return to board */}
                {isHost && (
                    <button
                        disabled={isFinalJeopardy && !drawings}
                        onClick={() => {
                            if (!showAnswer) {
                                setShowAnswer(true);
                                sendJson({ type: "reveal-answer", gameId });
                            } else {
                                setShowClue(false);

                                if (localSelectedClue) {
                                    const clueId = `${localSelectedClue.value}-${localSelectedClue.question}`;

                                    sendJson({ type: "clue-cleared", gameId, clueId });
                                    sendJson({ type: "return-to-board", gameId });

                                    if (isFinalJeopardy) {
                                        sendJson({ type: "trigger-game-over", gameId });
                                    }
                                }
                            }
                        }}
                        style={{ fontSize: "clamp(1rem, 2.5vw, 2rem)" }}
                        className={`mt-4 px-12 py-5 rounded-xl min-w-[22rem] font-bold shadow-2xl text-white transition duration-300 ease-in-out ${
                            isFinalJeopardy && !drawings
                                ? "bg-gray-400 cursor-not-allowed"
                                : showAnswer
                                    ? "bg-violet-500 hover:bg-violet-700"
                                    : "bg-indigo-700 hover:bg-indigo-900"
                        }`}
                    >
                        {isFinalJeopardy && !drawings
                            ? "Waiting for answers"
                            : showAnswer
                                ? "Return to Board"
                                : "Reveal Answer"}
                    </button>

                )}

                <div className="flex flex-wrap gap-4">
                    {drawings &&
                        !Array.isArray(drawings) &&
                        Object.entries(drawings).map(([player, drawingString]) => (
                            <div key={player} className="mb-5 z-0 w-auto">
                                <div className="flex flex-col items-center">
                                    {/* Customize avatar display */}
                                    <h2
                                        style={{ fontSize: "clamp(1rem, 2vw, 1.5rem)" }}
                                        className="text-center font-semibold mb-2"
                                    >
                                        {player}'s answer:
                                    </h2>
                                    {convertToSVG(drawingString)}
                                </div>
                            </div>
                        ))}
                </div>
            </div>
        </div>
    );
};

export default SelectedClueDisplay;

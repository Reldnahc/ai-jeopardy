import React, { useEffect, useRef, useState} from 'react';
import {Category, Clue} from "../../types.ts";
import JeopardyGrid from "./JeopardyGrid.tsx"; // Import the grid component
import WagerInput from "./WagerInput.tsx"; // Import the wager input component
import SelectedClueDisplay from "./SelectedClueDisplay.tsx";
import {useWebSocket} from "../../contexts/WebSocketContext.tsx";
import {Player} from "../../types/Lobby.ts";
import {useAlert} from "../../contexts/AlertContext.tsx"; // Import the selected clue component

interface JeopardyBoardProps {
    boardData: Category[];
    canSelectClue: boolean;
    onClueSelected: (clue: Clue) => void;
    selectedClue: Clue | null;
    gameId: string;
    clearedClues: Set<string>; // Add clearedClues
    players: Player[];         // Prop to track players in the game
    scores: Record<string, number>; // Player scores
    currentPlayer: string; // New prop for the current player
    allWagersSubmitted: boolean;
    isFinalJeopardy: boolean;
    drawings: Record<string, string> | null;
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
}

const JeopardyBoard: React.FC<JeopardyBoardProps> =
    ({ boardData, canSelectClue, onClueSelected, selectedClue, gameId, clearedClues, players, scores,
         currentPlayer, allWagersSubmitted, isFinalJeopardy, drawings,
           handleBuzz, buzzerLocked, buzzResult, buzzLockedOut, timerEndTime, timerDuration,
          answerCapture, answerError, effectivePlayerName, finalWagers}) => {
    const [localSelectedClue, setLocalSelectedClue] = useState<Clue | null>(null);
    const [showClue, setShowClue] = useState(false);
    const [wagers, setWagers] = useState<Record<string, number>>({});
    const [wagerSubmitted, setWagerSubmitted] = useState<string[]>([]);
    const [drawingSubmitted, setDrawingSubmitted] = useState<Record<string, boolean>>({});
    const { sendJson } = useWebSocket();
    const { showAlert } = useAlert();
    const showAnswer = Boolean(localSelectedClue?.showAnswer);

        // @ts-expect-error works better this way
    const canvasRef = useRef< ReactSketchCanvas>(null);
    const canvas_with_mask = document.querySelector("#react-sketch-canvas__stroke-group-0");
    if (canvas_with_mask)
        canvas_with_mask.removeAttribute("mask");

    // Automatically submit $0 wager upfront if the player has $0 or less
    useEffect(() => {
        if (canSelectClue)
            return;
        console.log(isFinalJeopardy);
        console.log(scores[currentPlayer]);
        if (isFinalJeopardy && (scores[currentPlayer] <= 0 || !scores[currentPlayer]) && !wagerSubmitted.includes(currentPlayer)) {
            submitWager(currentPlayer);
        }
    }, [currentPlayer, scores, wagerSubmitted, isFinalJeopardy]);

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

    const handleWagerChange = (player: string, wager: number) => {
        setWagers((prev) => ({ ...prev, [player]: wager }));
    };

        const submitWager = (player: string) => {
            const score = scores[player] ?? 0;

            // If score is <= 0 in Final Jeopardy, wager MUST be 0.
            const rawWager = wagers[player];
            const normalizedWager =
                score <= 0
                    ? 0
                    : Math.max(0, Number.isFinite(rawWager) ? rawWager : 0);

            // Only enforce max-wager rule when score > 0
            if (score > 0 && normalizedWager > score) {
                showAlert(
                    <span>
                        <span className="text-red-500 font-bold text-xl">
                            Wager cannot exceed current score!
                        </span>
                        <br />
                    </span>,
                    [
                        {
                            label: "Okay",
                            actionValue: "okay",
                            styleClass: "bg-green-500 text-white hover:bg-green-600",
                        },
                    ]
                );
                return;
            }

            // Persist the wager locally (so UI shows 0 too)
            setWagers((prev) => ({ ...prev, [player]: normalizedWager }));

            // Prevent duplicate submits
            setWagerSubmitted((prev) => (prev.includes(player) ? prev : [...prev, player]));

            if (normalizedWager > 0) {
                sendJson({
                    type: "submit-wager",
                    gameId,
                    player,
                    wager: normalizedWager,
                });
            }
        };



        if (!boardData || boardData.length === 0) {
        return <p>No board data available.</p>; // Handle invalid board data
    }

        return (
            <div
                className="relative w-full h-full m-0 overflow-hidden"
            >
                {isFinalJeopardy && !allWagersSubmitted && (
                    <div
                        className="flex flex-col items-center justify-center w-full h-full bg-gray-800 text-white"
                    >
                        <h2 className="text-2xl">Final Jeopardy Category:</h2>
                        <h1 className="text-6xl">{boardData[0].category}</h1>

                        <h2 className="text-2xl">Place Your Wager!</h2>
                        <WagerInput
                            players={players}
                            currentPlayer={currentPlayer}
                            scores={scores}
                            wagers={wagers}
                            wagerSubmitted={wagerSubmitted}
                            handleWagerChange={handleWagerChange}
                            submitWager={submitWager}
                        />
                    </div>
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
                        buzzerLocked={buzzerLocked}
                        buzzResult={buzzResult}
                        buzzLockedOut={buzzLockedOut}
                        timerEndTime={timerEndTime}
                        timerDuration={timerDuration}
                        answerCapture={answerCapture}
                        answerError={answerError}
                        effectivePlayerName={effectivePlayerName}
                        finalWagers={finalWagers}
                    />
                )}
            </div>
        );
};

export default JeopardyBoard;
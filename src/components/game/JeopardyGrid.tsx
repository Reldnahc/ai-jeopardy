import React from "react";
import { Category, Clue } from "../../../shared/types/board.ts";

interface JeopardyGridProps {
    boardData: Category[];
    isHost: boolean;
    clearedClues: Set<string>;
    handleClueClick: (clue: Clue, clueId: string) => void;
    isFinalJeopardy: boolean;
}

const JeopardyGrid: React.FC<JeopardyGridProps> = ({
                                                       boardData,
                                                       isHost,
                                                       clearedClues,
                                                       handleClueClick,
                                                       isFinalJeopardy,
                                                   }) => {
    return (
        <div
            className="flex justify-center items-center h-full w-full" // Parent wrapper to center the Grid
        >
            <div
                className={`grid gap-2 w-[98%] h-[98%] my-2`}
                style={{
                    gridTemplateColumns: `repeat(${boardData.length}, 1fr)`,
                    gridTemplateRows: `repeat(6, 1fr)`, // Updated to have all rows including headers be equal height
                }}
            >
                {/* Render Category Headers */}
                {boardData.map((category, colIndex) => (
                    <div
                        key={colIndex}
                        className={`flex justify-center items-center border-2 border-black text-center h-full bg-indigo-600 cursor-not-allowed`}
                        style={{
                            pointerEvents: "none", // Disable interactions for category headers
                            gridColumn: colIndex + 1,
                        }}
                    >
                        <span
                            style={{
                                fontSize: 'clamp(0.8rem, 1.8vw, 2.5rem)', // Force all headers to the same size
                                textAlign: 'center',
                                overflowWrap: 'break-word', // Prevent long text overflows
                                whiteSpace: 'normal', // Allow wrapping for long category names
                                wordBreak: 'break-word', // Ensure wrapping works consistently
                            }}
                        >
                            {category.category}
                        </span>
                    </div>
                ))}

                {/* Render Clues */}
                {boardData.map((category, colIndex) =>
                    category.values.map((clue, rowIndex) => {
                        const clueId = `${clue.value}-${clue.question}`;
                        const isCleared = clearedClues.has(clueId);

                        return (
                            <div
                                key={`${colIndex}-${rowIndex}`}
                                className={`flex justify-center items-center border-2 border-black text-center h-full text-3xl text-yellow-500 ${
                                    isCleared ? "bg-gray-300" : "bg-indigo-600"
                                } ${isHost && !isCleared ? "cursor-pointer" : "cursor-not-allowed"}`}
                                style={{
                                    gridColumn: colIndex + 1, // Tailwind won't dynamically handle grid columns/rows.
                                    gridRow: rowIndex + 2, // Clues always start from the 2nd row
                                }}
                                onClick={() => handleClueClick(clue, clueId)}
                            >
                                {isFinalJeopardy ? "Final Jeopardy!" : isCleared ? "" : `$${clue.value}`}
                            </div>
                        );
                    })
                )}
            </div>
        </div>
    );
};

export default JeopardyGrid;
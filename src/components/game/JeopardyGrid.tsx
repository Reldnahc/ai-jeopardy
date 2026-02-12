import React from "react";
import { Category, Clue } from "../../../shared/types/board.ts";

interface JeopardyGridProps {
    boardData: Category[];
    isHost: boolean;
    clearedClues: Set<string>;
    handleClueClick: (clue: Clue, clueId: string) => void;
    isFinalJeopardy: boolean;
}

const JEOPARDY_VALUE_STYLE: React.CSSProperties = {
    // BIG and responsive — will “fill” the tile without overflowing too badly.
    fontSize: "clamp(1.4rem, 5vw, 6rem)",
    fontWeight: 900,
    letterSpacing: "0.01em",
    lineHeight: 1,
    whiteSpace: "nowrap",
    textTransform: "uppercase",
    // Jeopardy-ish: bold, condensed, outlined
    fontFamily:
        '"swiss911","Impact", "Haettenschweiler", "Arial Black", "Franklin Gothic Medium", system-ui, sans-serif',
    WebkitTextStroke: "2px rgba(0,0,0,0.75)",
    textShadow:
        "0.05em 0.04em 0 rgba(0,0,0,0.8), 0.18em 0.18em 0.25em rgba(0,0,0,0.4)",

};

const JEOPARDY_HEADER_BASE_STYLE: React.CSSProperties = {
    fontWeight: 900,
    letterSpacing: "0.06em",
    lineHeight: 1.05,
    textTransform: "uppercase",
    fontFamily: '"swiss911", "Franklin Gothic Medium", "Arial Black", system-ui, sans-serif',
    WebkitTextStroke: "0.06em rgba(0,0,0,0.75)", // scales with font
    textShadow:
        "0.07em 0.07em 0 rgba(0,0,0,0.9), 0.14em 0.14em 0 rgba(0,0,0,0.6)",


};


function getHeaderFontSizeClamp(text: string): string {
    const len = (text ?? "").trim().length;

    // Tune these buckets to taste. Short categories get noticeably bigger.
    if (len <= 8)  return "clamp(1.1rem, 2.4vw, 3.0rem)";
    if (len <= 14) return "clamp(1.0rem, 2.1vw, 2.6rem)";
    if (len <= 20) return "clamp(0.95rem, 1.9vw, 2.3rem)";
    if (len <= 28) return "clamp(0.9rem, 1.7vw, 2.0rem)";
    return "clamp(0.8rem, 1.5vw, 1.8rem)";
}

const JeopardyGrid: React.FC<JeopardyGridProps> = ({
                                                       boardData,
                                                       isHost,
                                                       clearedClues,
                                                       handleClueClick,
                                                       isFinalJeopardy,
                                                   }) => {
    return (
        <div className="flex justify-center items-center h-full w-full">
            <div
                className="grid w-[98%] h-[98%] my-2"
                style={{
                    gridTemplateColumns: `repeat(${boardData.length}, 1fr)`,
                    gridTemplateRows: `repeat(6, 1fr)`,
                }}
            >
                {/* Category Headers */}
                {boardData.map((category, colIndex) => (
                    <div
                        key={colIndex}
                        className="flex justify-center items-center border-2 border-black border-b-[4px] text-center h-full bg-indigo-600 cursor-not-allowed px-2"
                        style={{
                            pointerEvents: "none",
                            gridColumn: colIndex + 1,
                        }}
                    >
                        <span
                            style={{
                                ...JEOPARDY_HEADER_BASE_STYLE,
                                fontSize: getHeaderFontSizeClamp(category.category),
                                textAlign: "center",
                                overflowWrap: "break-word",
                                whiteSpace: "normal",
                                wordBreak: "break-word",
                            }}
                            className="text-white"
                        >
                          {category.category}
                        </span>
                    </div>
                ))}

                {/* Clues */}
                {boardData.map((category, colIndex) =>
                    category.values.map((clue, rowIndex) => {
                        const clueId = `${clue.value}-${clue.question}`;
                        const isCleared = clearedClues.has(clueId);

                        const clickable = isHost && !isCleared;

                        return (
                            <div
                                key={`${colIndex}-${rowIndex}`}
                                className={[
                                    "relative border-2 border-black h-full",
                                    "select-none",
                                    isCleared ? "bg-gray-300" : "bg-indigo-600",
                                    clickable ? "cursor-pointer" : "cursor-not-allowed",
                                    // subtle “tile” depth like Jeopardy board
                                    "shadow-[inset_0_0_0_2px_rgba(255,255,255,0.06),inset_0_-10px_18px_rgba(0,0,0,0.25)]",
                                    "active:brightness-95",
                                ].join(" ")}
                                style={{
                                    gridColumn: colIndex + 1,
                                    gridRow: rowIndex + 2,
                                }}
                                onClick={() => handleClueClick(clue, clueId)}
                            >
                                {/* Centered content that fills the tile */}
                                <div className="absolute inset-0 flex items-center justify-center text-center px-2 overflow-hidden">
                                    {isFinalJeopardy ? (
                                        <span
                                            style={{
                                                ...JEOPARDY_VALUE_STYLE,
                                            }}
                                            className="text-yellow-300"
                                        >
                                          FINAL JEOPARDY!
                                        </span>
                                    ) : isCleared ? null : (
                                        <span style={JEOPARDY_VALUE_STYLE} className="text-yellow-400 flex items-center">
                                      <span
                                          style={{
                                              fontSize: "0.7em",
                                              marginRight: "0.03em",
                                              transform: "translateY(-0.03em)",
                                              }}
                                          >
                                          $
                                        </span>
                                          <span>{clue.value}</span>
                                        </span>
                                    )}
                                </div>
                            </div>
                        );
                    })
                )}
            </div>
        </div>
    );
};

export default JeopardyGrid;

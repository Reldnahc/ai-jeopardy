import React from "react";
import { useNavigate } from "react-router-dom";

interface FinalScoreScreenProps {
  scores: Record<string, number>;
}

const FinalScoreScreen: React.FC<FinalScoreScreenProps> = ({ scores }) => {
  const navigate = useNavigate();
  const sortedScores = Object.entries(scores).sort(([, a], [, b]) => b - a);

  return (
    <div className="min-h-screen w-full text-white px-6 py-16 flex flex-col">
      {/* Header */}
      <div className="max-w-7xl mx-auto mb-14 w-full">
        <h1 className="text-5xl md:text-6xl font-swiss911 tracking-wide text-yellow-400 text-shadow-jeopardy drop-shadow-xl">
          Final Scores
        </h1>
        <div className="h-1 w-40 bg-yellow-400 mt-4 rounded-full" />
      </div>

      {/* Score Grid */}
      <div className="max-w-7xl mx-auto w-full grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {sortedScores.map(([player, score], index) => (
          <div
            key={player}
            className={`
              relative p-6 rounded-2xl
              flex justify-between items-center
              transition-all duration-300
              hover:scale-[1.02]
              ${
                index === 0
                  ? `
                  bg-gradient-to-r from-yellow-400 to-yellow-500 
                  text-gray-900 
                  shadow-2xl shadow-yellow-500/40
                  border-4 border-yellow-300
                `
                  : `
                  bg-white/5 backdrop-blur-md
                  border border-white/10
                  hover:bg-white/10
                `
              }
            `}
          >
            {index === 0 && (
              <span className="absolute -top-3 -left-3 bg-blue-600 text-yellow-400 text-xs font-bold px-3 py-1 rounded-full border border-yellow-400">
                CHAMPION
              </span>
            )}

            <span className={`text-2xl ${index === 0 ? "font-bold" : "font-semibold"}`}>
              {player}
            </span>

            <span className={`text-2xl tabular-nums ${index === 0 ? "font-bold" : ""}`}>
              ${score.toLocaleString()}
            </span>
          </div>
        ))}
      </div>

      {/* Spacer pushes button to bottom only if there's extra vertical space */}
      <div className="flex-1" />

      {/* Return Button */}
      <div className="max-w-7xl mx-auto w-full pt-10">
        <button
          onClick={() => navigate("/")}
          className="
            px-10 py-4 text-lg font-bold tracking-wide
            bg-gradient-to-r from-orange-500 to-red-500
            rounded-xl
            transition-all duration-300
            hover:scale-105 hover:shadow-2xl
            shadow-lg
            focus:outline-none focus:ring-2 focus:ring-orange-400
          "
        >
          Return Home
        </button>
      </div>
    </div>
  );
};

export default FinalScoreScreen;

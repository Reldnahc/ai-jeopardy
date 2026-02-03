import React from 'react';
import { useNavigate } from 'react-router-dom';

interface FinalScoreScreenProps {
    scores: Record<string, number>;
}

const FinalScoreScreen: React.FC<FinalScoreScreenProps> = ({ scores }) => {
    const navigate = useNavigate();
    const sortedScores = Object.entries(scores).sort(([, scoreA], [, scoreB]) => scoreB - scoreA);

    return (
        <div className="min-h-screen w-full text-white font-poppins flex flex-col items-center justify-center p-8">
            <h1 className="text-5xl md:text-6xl font-bold mb-12 text-yellow-400 drop-shadow-lg animate-fade-in">
                Final Scores
            </h1>

            <div className="w-full max-w-7xl grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 px-4 mb-12">
                {sortedScores.map(([player, score], index) => (
                    <div
                        key={player}
                        className={`
                            flex justify-between items-center p-6 rounded-2xl
                            transform transition-all duration-300 hover:scale-105
                            ${index === 0
                            ? 'bg-gradient-to-r from-yellow-400 to-yellow-500 text-gray-900 shadow-yellow-400/50'
                            : 'bg-white/10 backdrop-blur-sm'}
                            shadow-lg hover:shadow-xl
                        `}
                    >
                        <span className={`text-2xl ${index === 0 ? 'font-bold' : 'font-semibold'}`}>
                            {player}
                        </span>
                        <span className={`text-2xl ${index === 0 ? 'font-bold' : ''}`}>
                            ${score}
                        </span>
                    </div>
                ))}
            </div>

            <button
                onClick={() => navigate('/')}
                className="
                    px-12 py-4 text-xl font-bold
                    bg-gradient-to-r from-orange-500 to-red-500
                    text-white rounded-xl
                    transform transition-all duration-300
                    hover:scale-105 hover:shadow-xl
                    focus:outline-none focus:ring-2 focus:ring-orange-500 focus:ring-opacity-50
                    shadow-lg
                "
            >
                Return Home
            </button>
        </div>
    );
};

export default FinalScoreScreen;
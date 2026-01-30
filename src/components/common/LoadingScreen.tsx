import React from 'react';

interface LoadingScreenProps {
    message?: string;
    progress?: number;
}

const LoadingScreen: React.FC<LoadingScreenProps> = ({
                                                         message = 'Loading',
                                                         progress = 0,
                                                     }) => {
    const pct = Math.max(0, Math.min(1, progress)) * 100;

    return (
        <div className="flex flex-col items-center justify-center h-[calc(100vh-5.5rem)] w-screen bg-gradient-to-r from-indigo-400 to-blue-700 text-white text-center">
            {/* Spinner */}
            <div className="relative w-16 h-16 mb-8">
                <div className="w-full h-full border-4 border-white border-t-transparent rounded-full animate-spin"></div>
                <div className="absolute top-1/2 left-1/2 w-12 h-12 bg-gradient-to-r from-indigo-400 to-blue-700 rounded-full transform -translate-x-1/2 -translate-y-1/2"></div>
            </div>

            {/* Animated Message */}
            <h1 className="text-4xl md:text-5xl font-bold tracking-wide">
                {message.split('').map((char, index) => (
                    <span
                        key={index}
                        className="inline-block animate-jump"
                        style={{ animationDelay: `${index * 0.05}s` }}
                    >
                        {char === ' ' ? '\u00A0' : char}
                    </span>
                ))}
            </h1>

            {/* Progress Bar (NEW) */}
            <div className="mt-6 w-[18rem] sm:w-[24rem] md:w-[28rem] h-3 rounded-full bg-white/25 overflow-hidden">
                <div
                    className="h-full bg-white/90 rounded-full transition-all duration-300 ease-out"
                    style={{ width: `${pct}%` }}
                />
            </div>
        </div>
    );
};

export default LoadingScreen;

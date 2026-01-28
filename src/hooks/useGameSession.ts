import { useState, useEffect } from 'react';

const SESSION_KEY = 'ai_jeopardy_session';

interface GameSession {
    gameId: string;
    playerName: string;
    isHost: boolean;
}

export const useGameSession = () => {
    const [session, setSession] = useState<GameSession | null>(null);

    // Load session on mount
    useEffect(() => {
        const stored = localStorage.getItem(SESSION_KEY);
        if (stored) {
            try {
                setSession(JSON.parse(stored));
            } catch (e) {
                console.error("Failed to parse game session", e);
                localStorage.removeItem(SESSION_KEY);
            }
        }
    }, []);

    const saveSession = (gameId: string, playerName: string, isHost: boolean) => {
        const newSession = { gameId, playerName, isHost };
        localStorage.setItem(SESSION_KEY, JSON.stringify(newSession));
        setSession(newSession);
    };

    const clearSession = () => {
        localStorage.removeItem(SESSION_KEY);
        setSession(null);
    };

    return { session, saveSession, clearSession };
};
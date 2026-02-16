// frontend/hooks/useGameSession.ts
import { useState, useEffect } from "react";

const SESSION_KEY = "ai_jeopardy_session";

export interface GameSession {
    gameId: string;
    playerKey: string;
    username: string | null;     // logged-in account username
    displayname: string;         // what UI shows
    isHost: boolean;
}

export const useGameSession = () => {
    const [session, setSession] = useState<GameSession | null>(null);

    useEffect(() => {
        const stored = localStorage.getItem(SESSION_KEY);
        if (!stored) return;

        try {
            const parsed = JSON.parse(stored) as Partial<GameSession>;

            // cheap guard for old schema
            if (!parsed || typeof parsed !== "object") throw new Error("bad session");
            if (!parsed.gameId) throw new Error("missing gameId");

            // If it's old schema (playerName), just drop it.
            if (!("playerKey" in parsed) || !("displayname" in parsed)) {
                localStorage.removeItem(SESSION_KEY);
                return;
            }

            setSession(parsed as GameSession);
        } catch (e) {
            console.error("Failed to parse game session", e);
            localStorage.removeItem(SESSION_KEY);
        }
    }, []);

    const saveSession = (next: GameSession) => {
        localStorage.setItem(SESSION_KEY, JSON.stringify(next));
        setSession(next);
    };

    const clearSession = () => {
        localStorage.removeItem(SESSION_KEY);
        setSession(null);
    };

    return { session, saveSession, clearSession };
};

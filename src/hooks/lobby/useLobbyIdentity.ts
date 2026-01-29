import { useMemo } from "react";
import { useGameSession } from "../useGameSession";
import { useProfile } from "../../contexts/ProfileContext";

export function useLobbyIdentity(args: {
    gameId: string | undefined;
    locationStatePlayerName?: string;
}) {
    const { gameId, locationStatePlayerName } = args;
    const { session } = useGameSession();
    const { profile } = useProfile();

    const playerKey = useMemo(() => {
        if (!gameId) return null;
        const storageKey = `aj_playerKey_${gameId}`;
        const existing = localStorage.getItem(storageKey);
        if (existing && existing.trim()) return existing;

        const created =
            globalThis.crypto && "randomUUID" in globalThis.crypto
                ? (globalThis.crypto as Crypto).randomUUID()
                : `${Date.now()}-${Math.random().toString(16).slice(2)}`;

        localStorage.setItem(storageKey, created);
        return created;
    }, [gameId]);

    const effectivePlayerName = useMemo(() => {
        if (locationStatePlayerName) return locationStatePlayerName;
        if (session?.gameId === gameId && session?.playerName) return session.playerName;
        if (profile?.displayname) return profile.displayname;
        return null;
    }, [locationStatePlayerName, session, gameId, profile]);

    return { playerKey, effectivePlayerName };
}
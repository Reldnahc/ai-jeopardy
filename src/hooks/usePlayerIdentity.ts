import { useMemo } from "react";
import { useGameSession } from "./useGameSession";
import { useProfile } from "../contexts/ProfileContext";

type UsePlayerIdentityArgs = {
    gameId?: string;
    locationStatePlayerName?: string;
    /**
     * If true, will fall back to profile.displayname when no name is provided.
     * For pages where the user must be logged in, this is useful.
     */
    allowProfileFallback?: boolean;
};

export function usePlayerIdentity({
                                      gameId,
                                      locationStatePlayerName,
                                      allowProfileFallback = true,
                                  }: UsePlayerIdentityArgs) {
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
        if (locationStatePlayerName && locationStatePlayerName.trim()) return locationStatePlayerName.trim();

        if (session?.gameId === gameId && session?.playerName?.trim()) return session.playerName.trim();

        if (allowProfileFallback && profile?.displayname?.trim()) return profile.displayname.trim();

        return null;
    }, [locationStatePlayerName, session, gameId, profile, allowProfileFallback]);

    return { playerKey, effectivePlayerName };
}

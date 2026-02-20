// frontend/hooks/usePlayerIdentity.ts
import { useMemo } from "react";
import { useGameSession } from "./useGameSession";
import { useProfile } from "../contexts/ProfileContext";

type UsePlayerIdentityArgs = {
  gameId?: string;
  locationState?: {
    username?: string | null;
    displayname?: string | null;
  } | null;
  allowProfileFallback?: boolean;
};

function makeGuestDisplayname() {
  return `Guest${Math.floor(1000 + Math.random() * 9000)}`;
}

export function usePlayerIdentity({
  gameId,
  locationState,
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

  const identity = useMemo(() => {
    // 1) route state
    const lsU = locationState?.username ?? null;
    const lsD = (locationState?.displayname ?? "").trim();
    if (lsD) return { username: lsU, displayname: lsD };

    // 2) session
    if (session?.gameId === gameId && session?.displayname?.trim()) {
      return { username: session.username ?? null, displayname: session.displayname.trim() };
    }

    // 3) logged-in profile
    if (allowProfileFallback && profile?.displayname?.trim()) {
      return { username: profile.username, displayname: profile.displayname.trim() };
    }

    // 4) guest fallback
    return { username: null, displayname: makeGuestDisplayname() };
  }, [locationState, session, gameId, profile, allowProfileFallback]);

  return { playerKey, username: identity.username, displayname: identity.displayname };
}

// frontend/contexts/ProfileContext.tsx
import React, {
    createContext,
    useCallback,
    useContext,
    useEffect,
    useMemo,
    useRef,
    useState,
    ReactNode,
} from "react";
import { useAuth } from "./AuthContext";
import {ProfileIconName} from "../components/common/profileIcons.tsx";

export interface ProfileStats {
    boards_generated?: number | null;
    games_finished?: number | null;
    games_played?: number | null;
    money_won?: number | null;
    games_won?: number | null;

    daily_double_found?: number | null;
    daily_double_correct?: number | null;

    final_jeopardy_participations?: number | null;
    final_jeopardy_corrects?: number | null;

    clues_selected?: number | null;
    times_buzzed?: number | null;
    total_buzzes?: number | null;

    correct_answers?: number | null;
    wrong_answers?: number | null;

    clues_skipped?: number | null;
    true_daily_doubles?: number | null;
}

export interface ProfileCustomization {
    bio?: string | null;
    color?: string | null;
    text_color?: string | null;
    name_color?: string | null;
    border?: string | null;
    border_color?: string | null;
    background?: string | null;
    background_color?: string | null;
    font?: string | null;
    icon?: ProfileIconName | null;
}

export interface Profile extends ProfileCustomization, ProfileStats {
    id: string;
    username: string;
    displayname: string;

    email?: string | null;
    role?: string | null;
    tokens?: number | null;

    created_at?: string;
    updated_at?: string;
}

interface CachedProfile {
    profile: Profile;
    cachedAt: number;
}

const PROFILE_TTL_MS = 60_000;

type ProfilesByUsername = Record<string, CachedProfile>;

interface ProfileContextType {
    /** Authenticated user's profile (/me). */
    profile: Profile | null;
    loading: boolean;
    error: string | null;

    /** Lookup cached profile by username (used by Avatar/Header). */
    getProfileByUsername: (username: string | null | undefined) => Profile | null;

    /** Fetch public profile by username into cache and return it. */
    fetchPublicProfile: (username: string) => Promise<Profile | null>;

    /** Fetch /me into cache and set as `profile`. */
    fetchMeProfile: () => Promise<Profile | null>;

    /** Patch authenticated profile (merge-defined-only). */
    applyProfilePatch: (patch: Partial<Profile>) => void;

    /** Patch cached profile by username (merge-defined-only). */
    patchProfileByUsername: (username: string, patch: Partial<Profile>) => void;

    /** Batch-fetch public profiles into cache. */
    fetchPublicProfiles: (usernames: string[]) => Promise<void>;

    refetchProfile: () => Promise<void>;
    setProfileExplicit: (p: Profile | null) => void;
}

const ProfileContext = createContext<ProfileContextType>({
    profile: null,
    loading: true,
    error: null,
    getProfileByUsername: () => null,
    fetchPublicProfile: async () => null,
    fetchMeProfile: async () => null,
    applyProfilePatch: () => {},
    patchProfileByUsername: () => {},
    fetchPublicProfiles: async () => {},
    refetchProfile: async () => {},
    setProfileExplicit: () => {},
});

function getErrorMessage(e: unknown): string {
    if (e instanceof Error) return e.message;
    return String(e);
}

function getApiBase() {
    if (import.meta.env.DEV) return import.meta.env.VITE_API_BASE || "http://localhost:3002";
    return "";
}

function normalizeUsername(u: unknown) {
    return String(u ?? "").trim().toLowerCase();
}

function mergeDefined<T extends object>(prev: T, patch: Partial<T>): T {
    const next: T = { ...prev };
    (Object.keys(patch) as Array<keyof T>).forEach((k) => {
        const v = patch[k];
        if (v !== undefined) {
            next[k] = v;
        }
    });
    return next;
}


async function safeJson(res: Response) {
    try {
        return await res.json();
    } catch {
        return null;
    }
}

export const ProfileProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
    const { token, user, loading: authLoading } = useAuth();

    const [profile, setProfile] = useState<Profile | null>(null);
    const [profilesByUsername, setProfilesByUsername] = useState<ProfilesByUsername>({});
    const [profileLoading, setProfileLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    // Separate sequences so /me and /public can't cancel each other
    const meSeq = useRef(0);
    const inFlightPublic = useRef(new Set<string>());

    const cacheUpsert = useCallback((p: Profile) => {
        const u = normalizeUsername(p.username);
        if (!u) return;

        setProfilesByUsername((prev) => {
            const existing = prev[u];
            if (!existing) {
                return { ...prev, [u]: { profile: p, cachedAt: Date.now() } };
            }

            // Always merge; server can correct optimistic mistakes.
            return {
                ...prev,
                [u]: {
                    profile: mergeDefined(existing.profile, p),
                    cachedAt: Date.now(),
                },
            };
        });
    }, []);

    const getProfileByUsername = useCallback(
        (uRaw: string | null | undefined): Profile | null => {
            const u = normalizeUsername(uRaw);
            if (!u) return null;

            const entry = profilesByUsername[u];
            if (!entry) return null;

            const isFresh = Date.now() - entry.cachedAt < PROFILE_TTL_MS;
            return isFresh ? entry.profile : null;
        },
        [profilesByUsername]
    );



    const fetchPublicProfile = useCallback(
        async (uRaw: string): Promise<Profile | null> => {
            const u = normalizeUsername(uRaw);
            if (!u) return null;

            // cached + fresh?
            const entry = profilesByUsername[u];
            if (entry) {
                const isFresh = Date.now() - entry.cachedAt < PROFILE_TTL_MS;
                if (isFresh) return entry.profile;
            }


            // in-flight?
            if (inFlightPublic.current.has(u)) return null;
            inFlightPublic.current.add(u);

            try {
                const api = getApiBase();
                const res = await fetch(`${api}/api/profile/${encodeURIComponent(u)}`, { cache: "no-store" });

                if (!res.ok) {
                    const data = await safeJson(res);
                    throw new Error(data?.error || "Failed to load profile");
                }

                const data = await safeJson(res);
                if (!data) throw new Error("Failed to load profile");

                const p = data.profile as Profile;
                if (p) cacheUpsert(p);
                return p ?? null;
            } finally {
                inFlightPublic.current.delete(u);
            }
        },
        [cacheUpsert, profilesByUsername]
    );


    const fetchPublicProfiles = useCallback(
        async (usernamesRaw: string[]): Promise<void> => {
            const usernames = (usernamesRaw ?? [])
                .map(normalizeUsername)
                .filter(Boolean);

            if (usernames.length === 0) return;

            // only fetch ones not in cache AND not already in flight
            const now = Date.now();

            const missing = usernames.filter((u) => {
                const entry = profilesByUsername[u];
                if (!entry) return true;

                const isFresh = now - entry.cachedAt < PROFILE_TTL_MS;
                return !isFresh;
            });
            if (missing.length === 0) return;

            // mark in-flight per username so multiple callers don't race
            for (const u of missing) inFlightPublic.current.add(u);

            try {
                const api = getApiBase();
                const qs = new URLSearchParams();
                for (const u of missing.slice(0, 50)) qs.append("u", u);

                const res = await fetch(`${api}/api/profile/batch?${qs.toString()}`, { cache: "no-store" });

                if (!res.ok) {
                    const data = await safeJson(res);
                    throw new Error(data?.error || "Failed to load profiles");
                }

                const data = await safeJson(res);
                const arr = (data?.profiles ?? []) as Profile[];

                for (const p of arr) if (p) cacheUpsert(p);
            } finally {
                for (const u of missing) inFlightPublic.current.delete(u);
            }
        },
        [profilesByUsername, cacheUpsert]
    );


    const fetchMeProfile = useCallback(
        async (): Promise<Profile | null> => {
            if (!token) return null;

            const myReq = ++meSeq.current;

            const api = getApiBase();
            const res = await fetch(`${api}/api/profile/me`, {
                headers: { Authorization: `Bearer ${token}` },
                cache: "no-store",
            });

            if (!res.ok) {
                const data = await safeJson(res);
                throw new Error(data?.error || "Failed to load profile");
            }

            const data = await safeJson(res);
            if (!data) throw new Error("Failed to load profile");

            const p = data.profile as Profile;
            if (p) {
                cacheUpsert(p);
                if (myReq === meSeq.current) {
                    setProfile(p);
                }
            }
            return p ?? null;
        },
        [token, cacheUpsert]
    );

    const applyProfilePatch = useCallback(
        (patch: Partial<Profile>) => {
            setProfile((prev) => {
                if (!prev) return prev;
                if (patch.id && patch.id !== prev.id) return prev;

                const optimistic = { ...patch } as Partial<Profile>;

                const next = mergeDefined(prev, optimistic);
                cacheUpsert(next);
                return next;
            });
        },
        [cacheUpsert]
    );

    const patchProfileByUsername = useCallback((uRaw: string, patch: Partial<Profile>) => {
        const u = normalizeUsername(uRaw);
        if (!u) return;

        const optimistic = { ...patch } as Partial<Profile>;

        setProfilesByUsername((prev) => {
            const existing = prev[u];
            if (!existing) return prev;

            const nextProfile = mergeDefined(existing.profile, optimistic);

            return {
                ...prev,
                [u]: {
                    profile: nextProfile,
                    cachedAt: Date.now(),
                },
            };
        });


        setProfile((prev) => {
            if (!prev) return prev;
            if (normalizeUsername(prev.username) !== u) return prev;
            return mergeDefined(prev, optimistic);
        });
    }, []);


    const refetchProfile = useCallback(async () => {
        setError(null);
        setProfileLoading(true);

        try {
            if (!token) {
                setProfile(null);
                return;
            }
            await fetchMeProfile();
        } catch (e: unknown) {
            setError(getErrorMessage(e));
            setProfile(null);
        } finally {
            setProfileLoading(false);
        }
    }, [token, fetchMeProfile]);

    // Load /me when auth is ready
    useEffect(() => {
        if (authLoading) return;

        if (!token) {
            setProfile(null);
            setProfileLoading(false);
            setError(null);
            return;
        }

        void refetchProfile();
    }, [authLoading, token, refetchProfile]);

    // Seed "me" into cache for avatar colors (once)
    useEffect(() => {
        if (authLoading) return;
        if (!token || !user?.username) return;

        const cached = getProfileByUsername(user.username);
        if (cached) return;

        void fetchMeProfile().catch(() => {});
    }, [authLoading, token, user?.username, getProfileByUsername, fetchMeProfile]);

    const ctxValue = useMemo(
        () => ({
            profile,
            loading: profileLoading,
            error,
            getProfileByUsername,
            fetchPublicProfile,
            fetchPublicProfiles,
            fetchMeProfile,
            applyProfilePatch,
            patchProfileByUsername,
            refetchProfile,
            setProfileExplicit: setProfile,
        }),
        [
            profile,
            profileLoading,
            error,
            getProfileByUsername,
            fetchPublicProfile,
            fetchPublicProfiles,
            fetchMeProfile,
            applyProfilePatch,
            patchProfileByUsername,
            refetchProfile,
        ]
    );

    return <ProfileContext.Provider value={ctxValue}>{children}</ProfileContext.Provider>;
};

export const useProfile = () => useContext(ProfileContext);

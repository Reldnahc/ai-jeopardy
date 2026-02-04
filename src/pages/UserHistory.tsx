import { useEffect, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { Board } from "../types/Board";
import Avatar from "../components/common/Avatar";
import LoadingScreen from "../components/common/LoadingScreen";
import ProfileGameCard from "../components/profile/ProfileGameCard";

type ProfileData = {
    id: string;
    username: string;
    displayname: string;
    bio?: string | null;
    role: string;

    // New DB fields (migrated from user_profiles)
    color?: string | null;
    text_color?: string | null;

    // If you still have it, fine to keep optional
    avatar_url?: string | null;
};

interface RouteParams extends Record<string, string | undefined> {
    username: string;
}

type ApiErrorPayload = {
    error?: string;
    message?: string;
};

const PAGE_SIZE = 10;

function getApiBase() {
    return import.meta.env.VITE_API_BASE || "http://localhost:3002";
}

function isRecord(v: unknown): v is Record<string, unknown> {
    return typeof v === "object" && v !== null;
}

function getErrorMessage(err: unknown, fallback: string) {
    if (err instanceof Error && err.message) return err.message;
    if (isRecord(err) && typeof err.message === "string") return err.message;
    return fallback;
}

async function fetchJson<T>(url: string): Promise<T> {
    const res = await fetch(url, { credentials: "include" });
    const text = await res.text();

    let payload: unknown = null;
    try {
        payload = text ? (JSON.parse(text) as unknown) : null;
    } catch {
        // ignore
    }

    if (!res.ok) {
        const p = (isRecord(payload) ? (payload as ApiErrorPayload) : null) ?? null;
        const msg = p?.error || p?.message || text || `HTTP ${res.status}`;
        throw new Error(msg);
    }

    return payload as T;
}

export default function UserHistory() {
    const { username } = useParams<RouteParams>();

    const [profile, setProfile] = useState<ProfileData | null>(null);
    const [boards, setBoards] = useState<Board[]>([]);

    const [loadingProfile, setLoadingProfile] = useState(true);
    const [loadingBoards, setLoadingBoards] = useState(false);
    const [hasMoreBoards, setHasMoreBoards] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const loadMoreRef = useRef<HTMLDivElement | null>(null);

    useEffect(() => {
        const run = async () => {
            if (!username) return;

            setLoadingProfile(true);
            setError(null);
            setBoards([]);
            setHasMoreBoards(true);

            try {
                const api = getApiBase();
                // Your backend route returns: { profile }
                const data = await fetchJson<{ profile: ProfileData }>(
                    `${api}/api/profile/${encodeURIComponent(username)}`
                );
                setProfile(data.profile ?? null);
            } catch (e: unknown) {
                setProfile(null);
                setError(getErrorMessage(e, "Profile not found."));
            } finally {
                setLoadingProfile(false);
            }
        };

        run();
    }, [username]);

    const fetchBoards = async (offset: number) => {
        if (!username) return;
        if (loadingBoards || !hasMoreBoards) return;

        setLoadingBoards(true);

        try {
            const api = getApiBase();
            // Your backend route returns: { boards }
            const data = await fetchJson<{ boards: Board[] }>(
                `${api}/api/profile/${encodeURIComponent(username)}/boards?offset=${offset}&limit=${PAGE_SIZE}`
            );

            const newBoards = data.boards ?? [];
            setBoards((prev) => [...prev, ...newBoards]);

            if (newBoards.length < PAGE_SIZE) {
                setHasMoreBoards(false);
            }
        } catch (e: unknown) {
            setError(getErrorMessage(e, "Failed to load boards."));
            setHasMoreBoards(false);
        } finally {
            setLoadingBoards(false);
        }
    };

    // Initial boards load once profile is ready
    useEffect(() => {
        if (!profile) return;
        fetchBoards(0);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [profile?.id]);

    // Infinite scroll
    useEffect(() => {
        if (!loadMoreRef.current) return;

        const observer = new IntersectionObserver(
            (entries) => {
                if (!entries[0].isIntersecting) return;
                if (!hasMoreBoards || loadingBoards) return;
                fetchBoards(boards.length);
            },
            { threshold: 1.0 }
        );

        observer.observe(loadMoreRef.current);

        return () => observer.disconnect();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [boards.length, hasMoreBoards, loadingBoards, profile?.id]);

    if (loadingProfile) {
        return <LoadingScreen message="Loading history" progress={-1} />;
    }

    if (error || !profile) {
        return (
            <div className="flex items-center justify-center h-screen">
                <p className="text-xl text-red-600">{error ?? "Profile not found."}</p>
            </div>
        );
    }

    const selectedColor = profile.color ?? null;
    const selectedTextColor = profile.text_color ?? null;

    return (
        <div className="min-h-screen bg-gradient-to-r from-indigo-400 to-blue-700 flex flex-col items-center p-6">
            <div className="bg-white rounded-xl shadow-2xl overflow-hidden w-full max-w-6xl">
                <div className="p-10">
                    {/* Header */}
                    <div className="flex items-center justify-between gap-4 flex-wrap mb-8">
                        <div className="flex items-center gap-4">
                            <div className="w-16 h-16 flex-shrink-0">
                                <Avatar
                                    name={username || "A"}
                                    size="16"
                                    color={selectedColor}
                                    textColor={selectedTextColor}
                                />
                            </div>
                            <div>
                                <h1 className="text-3xl font-bold text-gray-900">Board History</h1>
                                <p className="text-gray-600">
                                    Generated by{" "}
                                    <span className="font-semibold">{profile.displayname}</span>
                                </p>
                                {profile.bio ? (
                                    <p className="text-gray-600 mt-1">{profile.bio}</p>
                                ) : null}
                            </div>
                        </div>

                        <div className="flex items-center gap-3">
                            <Link
                                to={`/profile/${profile.username}`}
                                className="px-4 py-2 rounded-lg bg-gray-200 text-gray-800 font-semibold hover:bg-gray-300 transition-colors"
                            >
                                Back to Profile
                            </Link>
                        </div>
                    </div>

                    {/* Boards */}
                    <div className="space-y-4">
                        {boards.length > 0 ? (
                            boards.map((board, idx) => (
                                <ProfileGameCard key={`${idx}`} game={board} />
                            ))
                        ) : (
                            <p className="text-gray-600 italic">No boards generated yet.</p>
                        )}

                        {/* Infinite scroll sentinel */}
                        {hasMoreBoards && (
                            <div ref={loadMoreRef} className="h-10 flex items-center justify-center">
                                {loadingBoards ? (
                                    <p className="text-gray-600">Loading more…</p>
                                ) : (
                                    <p className="text-gray-600">Scroll to load more</p>
                                )}
                            </div>
                        )}

                        {!hasMoreBoards && boards.length > 0 && (
                            <p className="text-gray-600 text-center mt-6">You’ve reached the end.</p>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}

import { useEffect, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { supabase } from "../supabaseClient";
import { Board } from "../types/Board";
import Avatar from "../components/common/Avatar";
import LoadingScreen from "../components/common/LoadingScreen";
import ProfileGameCard from "../components/profile/ProfileGameCard";

interface ProfileData {
    username: string;
    avatar_url?: string | null;
    bio?: string | null;
    role: string;
    displayname: string;
    id: string;
}

interface UserProfileRow {
    id: string;
    color?: string | null;
    text_color?: string | null;
}

interface RouteParams extends Record<string, string | undefined> {
    username: string;
}

const PAGE_SIZE = 10;

export default function UserHistory() {
    const { username } = useParams<RouteParams>();

    const [profile, setProfile] = useState<ProfileData | null>(null);
    const [selectedColor, setSelectedColor] = useState<string | null>(null);
    const [selectedTextColor, setSelectedTextColor] = useState<string | null>(null);

    const [boards, setBoards] = useState<Board[]>([]);
    const [loadingProfile, setLoadingProfile] = useState(true);

    const [loadingBoards, setLoadingBoards] = useState(false);
    const [hasMoreBoards, setHasMoreBoards] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const loadMoreRef = useRef<HTMLDivElement | null>(null);

    useEffect(() => {
        const fetchProfile = async () => {
            if (!username) return;

            setLoadingProfile(true);
            setError(null);
            setBoards([]);
            setHasMoreBoards(true);

            // 1) Profile
            const { data: profileData, error: profileError } = await supabase
                .from("profiles")
                .select("*")
                .eq("username", username)
                .single();

            if (profileError || !profileData) {
                setError(profileError?.message ?? "Profile not found.");
                setLoadingProfile(false);
                return;
            }

            setProfile(profileData);

            // 2) User colors (optional)
            const { data: userProfileData } = await supabase
                .from("user_profiles")
                .select("*")
                .eq("id", profileData.id)
                .single();

            const typed = userProfileData as UserProfileRow | null;
            setSelectedColor(typed?.color ?? null);
            setSelectedTextColor(typed?.text_color ?? null);

            setLoadingProfile(false);
        };

        fetchProfile();
    }, [username]);

    const fetchBoards = async (offset: number) => {
        if (!profile?.displayname) return;
        if (loadingBoards || !hasMoreBoards) return;

        setLoadingBoards(true);

        const { data, error: boardsError } = await supabase
            .from("jeopardy_boards")
            .select("board")
            .eq("board->>host", profile.displayname)
            .order("created_at", { ascending: false })
            .range(offset, offset + PAGE_SIZE - 1);

        if (boardsError) {
            setError(boardsError.message);
            setLoadingBoards(false);
            return;
        }

        const newBoards = (data ?? []).map(({ board }: { board: Board }) => board);
        setBoards((prev) => [...prev, ...newBoards]);

        if (!data || data.length < PAGE_SIZE) {
            setHasMoreBoards(false);
        }

        setLoadingBoards(false);
    };

    // Initial boards load once profile is ready
    useEffect(() => {
        if (!profile?.displayname) return;
        fetchBoards(0);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [profile?.displayname]);

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
    }, [boards.length, hasMoreBoards, loadingBoards, profile?.displayname]);

    if (loadingProfile) {
        return <LoadingScreen message="Loading history" />;
    }

    if (error || !profile) {
        return (
            <div className="flex items-center justify-center h-screen">
                <p className="text-xl text-red-600">{error ?? "Profile not found."}</p>
            </div>
        );
    }

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
                                    Generated by <span className="font-semibold">{profile.displayname}</span>
                                </p>
                                {profile.bio ? <p className="text-gray-600 mt-1">{profile.bio}</p> : null}
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
                            boards.map((board, idx) => <ProfileGameCard key={`${idx}`} game={board} />)
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

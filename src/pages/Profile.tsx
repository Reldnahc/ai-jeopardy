import React, { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { Board } from "../types/Board";
import ProfileGameCard from "../components/profile/ProfileGameCard";
import Avatar from "../components/common/Avatar";
import { useAuth } from "../contexts/AuthContext";
import LoadingScreen from "../components/common/LoadingScreen";

interface ProfileData {
    id: string;
    username: string;
    displayname: string;
    role?: string | null;
    bio?: string | null;

    // stored as hex in your local db schema
    color?: string | null;
    text_color?: string | null;

    boards_generated?: number | null;
    games_won?: number | null;
    games_finished?: number | null;
}

interface RouteParams extends Record<string, string | undefined> {
    username: string;
}

function getApiBase() {
    // In dev, allow explicit override
    if (import.meta.env.DEV) {
        return import.meta.env.VITE_API_BASE || "http://localhost:3002";
    }

    // In prod, use same-origin
    return "";
}

const Profile: React.FC = () => {
    const { username } = useParams<RouteParams>();
    const { user, token, updateUser} = useAuth();

    const [profile, setProfile] = useState<ProfileData | null>(null);
    const [boards, setBoards] = useState<Board[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const [selectedColor, setSelectedColor] = useState<string | null>(null);
    const [selectedTextColor, setSelectedTextColor] = useState<string | null>(null);

    const isOwnProfile = useMemo(() => {
        return Boolean(user?.id && profile?.id && user.id === profile.id);
    }, [user?.id, profile?.id]);

    useEffect(() => {
        const run = async () => {
            try {
                setLoading(true);
                setError(null);

                const u = String(username || "").trim().toLowerCase();
                if (!u) {
                    setProfile(null);
                    setBoards([]);
                    setError("Missing username");
                    return;
                }

                const api = getApiBase();

                // 1) profile
                {
                    // Inside your useEffect run function:
                    const res = await fetch(`${api}/api/profile/${encodeURIComponent(u)}`);

// Check if the response is actually JSON before parsing
                    const contentType = res.headers.get("content-type");
                    if (!contentType || !contentType.includes("application/json")) {
                        const fallbackText = await res.text();
                        console.error("DEBUG: Server returned HTML instead of JSON. Check your API route.");
                        console.log("Response starts with:", fallbackText.substring(0, 100)); // Will likely show <!DOCTYPE html>
                        throw new Error("API Route not found or returning HTML");
                    }

                    const data = await res.json();
// Now 'data' is guaranteed to be an object
                    console.log("DEBUG: Received data:", data);

                    if (!res.ok) throw new Error(data?.error || "Failed to load profile");

                    setProfile(data.profile);

                    // initialize colors from profile
                    setSelectedColor(data.profile?.color ?? null);
                    setSelectedTextColor(data.profile?.text_color ?? null);
                }

                // 2) recent boards
                {
                    const res = await fetch(
                        `${api}/api/profile/${encodeURIComponent(u)}/boards?limit=5`
                    );
                    const data = await res.json();
                    if (!res.ok) throw new Error(data?.error || "Failed to load boards");

                    setBoards((data.boards ?? []) as Board[]);
                }
            } catch (e: any) {
                setError(String(e?.message || e));
                setProfile(null);
                setBoards([]);
            } finally {
                setLoading(false);
            }
        };

        void run();
    }, [username]);

    const saveSelectedColor = async (value: string, field: "color" | "text_color") => {
        if (!token) return;

        // optimistic
        if (field === "color") setSelectedColor(value);
        else setSelectedTextColor(value);

        try {
            const api = getApiBase();
            const res = await fetch(`${api}/api/profile/me`, {
                method: "PATCH",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${token}`,
                },
                body: JSON.stringify({ [field]: value }),
            });

            const data = await res.json();
            if (!res.ok) throw new Error(data?.error || "Failed to update profile");

            updateUser({
                color: data.profile?.color ?? (field === "color" ? value : user?.color),
                text_color: data.profile?.text_color ?? (field === "text_color" ? value : user?.text_color),
            });

        } catch (e: any) {
            setError(String(e?.message || e));
        }
    };

    // Hex palettes (match your DB + trigger validation)
    const colors = [
        "#3b82f6", "#6366f1", "#06b6d4", "#0ea5e9",
        "#22c55e", "#10b981", "#14b8a6", "#84cc16",
        "#eab308", "#f59e0b", "#f97316", "#ef4444",
        "#f43f5e", "#ec4899", "#d946ef", "#a855f7",
        "#8b5cf6", "#6b7280", "#78716c", "#64748b",
        "#71717a", "#000000", "#ffffff",
    ];

    const textColors = [
        "#ffffff", "#000000", "#111827", "#1f2937",
        "#ef4444", "#f97316", "#f59e0b", "#eab308",
        "#22c55e", "#10b981", "#06b6d4", "#3b82f6",
        "#6366f1", "#a855f7", "#ec4899",
    ];

    if (loading) {
        return <LoadingScreen message="Loading profile" progress={-1} />;
    }

    if (error || !profile) {
        return (
            <div className="flex items-center justify-center h-screen">
                <p className="text-xl text-red-600">{error ? error : "Profile not found."}</p>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-gradient-to-r from-indigo-400 to-blue-700 flex items-center justify-center p-6">
            <div className="max-w-3xl w-full bg-white rounded-xl shadow-2xl overflow-hidden p-6">
                <div className="space-y-8">
                    {/* Profile Header */}
                    <div className="flex items-center space-x-4">
                        <div className="w-16 h-16 flex-shrink-0">
                            <Avatar
                                name={username || "A"}
                                size="16"
                                color={selectedColor}
                                textColor={selectedTextColor}
                            />
                        </div>
                        <div>
                            <h1 className="text-2xl font-bold text-blue-500">{profile.displayname}</h1>

                            {profile.role === "admin" && (
                                <h3 className="text-sm mt-1 text-red-600">
                                    {profile.role.charAt(0).toUpperCase() +
                                        profile.role.slice(1).toLowerCase()}
                                </h3>
                            )}

                            {profile.bio && <p className="mt-1 text-gray-600">{profile.bio}</p>}
                        </div>
                    </div>

                    {/* User Settings (only for self) */}
                    {isOwnProfile && (
                        <div>
                            <h2 className="text-2xl font-semibold mb-4 text-gray-800">User Settings</h2>

                            {!token ? (
                                <p className="text-gray-600">Log in to edit your profile colors.</p>
                            ) : (
                                <div className="space-y-6">
                                    {/* Background Color */}
                                    <div>
                                        <h3 className="text-xl font-semibold mb-2 text-gray-800">
                                            Background Color
                                        </h3>
                                        <div className="flex flex-wrap gap-2">
                                            {colors.map((c) => (
                                                <button
                                                    key={c}
                                                    type="button"
                                                    className={`w-8 h-8 rounded-full border border-gray-300 cursor-pointer ${
                                                        selectedColor === c ? "ring-4 ring-blue-400" : ""
                                                    }`}
                                                    style={{ backgroundColor: c }}
                                                    onClick={() => saveSelectedColor(c, "color")}
                                                    aria-label={`Set background color ${c}`}
                                                />
                                            ))}
                                        </div>
                                    </div>

                                    {/* Icon Color */}
                                    <div>
                                        <h3 className="text-xl font-semibold mb-2 text-gray-800">Icon Color</h3>
                                        <div className="flex flex-wrap gap-2">
                                            {textColors.map((c) => (
                                                <button
                                                    key={c}
                                                    type="button"
                                                    className={`w-8 h-8 rounded-full border border-gray-300 cursor-pointer ${
                                                        selectedTextColor === c ? "ring-4 ring-blue-400" : ""
                                                    }`}
                                                    style={{ backgroundColor: c }}
                                                    onClick={() => saveSelectedColor(c, "text_color")}
                                                    aria-label={`Set icon color ${c}`}
                                                />
                                            ))}
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>
                    )}

                    {/* Player Stats */}
                    <div>
                        <h2 className="text-2xl font-semibold mb-4 text-gray-800">Player Stats</h2>
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                            <div className="bg-gray-100 p-4 rounded-lg shadow">
                                <p className="text-gray-800">Boards Generated</p>
                                <p className="text-lg font-semibold text-gray-900">
                                    {profile.boards_generated ?? 0}
                                </p>
                            </div>
                            <div className="bg-gray-100 p-4 rounded-lg shadow">
                                <p className="text-gray-800">Games Finished</p>
                                <p className="text-lg font-semibold text-gray-900">
                                    {profile.games_finished ?? 0}
                                </p>
                            </div>
                            <div className="bg-gray-100 p-4 rounded-lg shadow">
                                <p className="text-gray-800">Games Won</p>
                                <p className="text-lg font-semibold text-gray-900">
                                    {profile.games_won ?? 0}
                                </p>
                            </div>
                        </div>
                    </div>

                    {/* Recently Generated Boards */}
                    <div>
                        <div className="flex items-center justify-between mb-4">
                            <h2 className="text-2xl font-semibold text-gray-800">Recently Generated Boards</h2>

                            <Link
                                to={`/profile/${profile.username}/history`}
                                className="px-4 py-2 rounded-lg bg-blue-600 text-white font-semibold hover:bg-blue-700 transition-colors"
                            >
                                View full history
                            </Link>
                        </div>

                        <div className="space-y-4">
                            {boards.length > 0 ? (
                                boards.map((board, idx) => <ProfileGameCard key={idx} game={board} />)
                            ) : (
                                <p className="text-gray-600 italic">No boards generated yet.</p>
                            )}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default Profile;

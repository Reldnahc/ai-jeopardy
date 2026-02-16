// frontend/pages/Profile.tsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { Board } from "../types/Board";
import ProfileGameCard from "../components/profile/ProfileGameCard";
import Avatar from "../components/common/Avatar";
import { useAuth } from "../contexts/AuthContext";
import LoadingScreen from "../components/common/LoadingScreen";
import { Profile as P, useProfile } from "../contexts/ProfileContext";
import ProfileIcon from "../components/common/ProfileIcon";
import {
    getProfilePresentation,
    PROFILE_COLOR_OPTIONS,
    PROFILE_FONT_OPTIONS,
    PROFILE_ICON_OPTIONS
} from "../utils/profilePresentation.ts";

interface RouteParams extends Record<string, string | undefined> {
    username: string;
}

function getApiBase() {
    if (import.meta.env.DEV) return import.meta.env.VITE_API_BASE || "http://localhost:3002";
    return "";
}

type CustomField = "color" | "text_color" | "name_color" | "bio" | "font" | "icon" | "border";
type CustomPatch = Partial<Pick<P, CustomField>>;

type PatchMeResponse = {
    profile?: P;
    error?: string;
};

function normalizeUsername(u: unknown) {
    return String(u ?? "").trim().toLowerCase();
}
function toErrorMessage(e: unknown) {
    if (e instanceof Error) return e.message;
    return String(e);
}

const Profile: React.FC = () => {
    const { username } = useParams<RouteParams>();
    const { user, token } = useAuth();

    // IMPORTANT:
    // `profile` here should remain "me" (authenticated user's profile)
    const {
        profile: me,
        loading,
        error,
        applyProfilePatch,
        refetchProfile,
        fetchPublicProfile,
        patchProfileByUsername,
    } = useProfile();

    const [boards, setBoards] = useState<Board[]>([]);
    const [boardsLoading, setBoardsLoading] = useState(true);
    const [localError, setLocalError] = useState<string | null>(null);

    const [bioDraft, setBioDraft] = useState<string>("");
    const [savingBio, setSavingBio] = useState(false);

    const [routeProfile, setRouteProfile] = useState<P | null>(null);
    const [routeLoading, setRouteLoading] = useState(true);
    const [routeError, setRouteError] = useState<string | null>(null);

    // Viewing "my" profile if the route profile id matches the logged-in user id
    const isOwnProfile = useMemo(() => {
        return Boolean(user?.id && routeProfile?.id && user.id === routeProfile.id);
    }, [user?.id, routeProfile?.id]);

    const fetchSeq = useRef(0);

    /**
     * Pending customization overlay to prevent UI "snap back"
     * when backend briefly returns stale profile values.
     */
    const pendingOverlayRef = useRef<CustomPatch>({});
    const pendingSinceRef = useRef<number>(0);

    function applyOverlay(p: P | null): P | null {
        if (!p) return p;
        const overlay = pendingOverlayRef.current;
        if (!overlay || Object.keys(overlay).length === 0) return p;
        // Overlay ALWAYS wins locally
        return { ...p, ...overlay };
    }

    function addOverlay(patch: CustomPatch) {
        pendingOverlayRef.current = { ...pendingOverlayRef.current, ...patch };
        pendingSinceRef.current = Date.now();
    }

    function maybeClearOverlayIfServerMatches(serverProfile: P, patch: CustomPatch) {
        // If the server returned the same value we asked for, clear that key from overlay.
        const next = { ...pendingOverlayRef.current };
        let changed = false;

        for (const k of Object.keys(patch) as CustomField[]) {
            if (serverProfile[k] === patch[k]) {
                delete next[k];
                changed = true;
            }
        }

        if (changed) pendingOverlayRef.current = next;
    }

    // Load the profile for the route (/profile/:username)
    useEffect(() => {
        const u = normalizeUsername(username);
        if (!u) return;

        const mySeq = ++fetchSeq.current;

        void (async () => {
            setRouteLoading(true);
            setRouteError(null);
            try {
                const p = await fetchPublicProfile(u);

                if (mySeq !== fetchSeq.current) return;

                // ALWAYS re-apply local overlay to avoid snapback.
                setRouteProfile(applyOverlay(p));
            } catch (e: unknown) {
                if (mySeq === fetchSeq.current) {
                    setRouteProfile(null);
                    setRouteError(toErrorMessage(e));
                }
            } finally {
                if (mySeq === fetchSeq.current) {
                    setRouteLoading(false);
                }
            }
        })();
    }, [username, fetchPublicProfile]);

    // Keep bioDraft in sync with the DISPLAYED profile (routeProfile), not "me"
    useEffect(() => {
        setBioDraft(routeProfile?.bio ?? "");
    }, [routeProfile?.bio, routeProfile?.id]);

    // Fetch boards when username changes
    useEffect(() => {
        const run = async () => {
            try {
                setBoardsLoading(true);
                setLocalError(null);

                const u = normalizeUsername(username);
                if (!u) {
                    setBoards([]);
                    setLocalError("Missing username");
                    return;
                }

                const api = getApiBase();
                const res = await fetch(`${api}/api/profile/${encodeURIComponent(u)}/boards?limit=5`);
                const data = await res.json();
                if (!res.ok) throw new Error(data?.error || "Failed to load boards");

                setBoards((data.boards ?? []) as Board[]);
            } catch (e: unknown) {
                setLocalError(toErrorMessage(e));
                setBoards([]);
            } finally {
                setBoardsLoading(false);
            }
        };

        void run();
    }, [username]);

    const saveCustomization = async (patch: CustomPatch) => {
        if (!token) return;

        // Track overlay FIRST so any incoming fetch/response cannot snap us back.
        addOverlay(patch);

        // Optimistic UI update: overlay onto existing local profile
        setRouteProfile((prev) => (prev ? applyOverlay({ ...prev, ...patch }) : prev));

        // Update caches too (avatar/header etc.)
        applyProfilePatch(patch);
        if (routeProfile?.username) {
            patchProfileByUsername(routeProfile.username, patch);
        }

        try {
            const api = getApiBase();
            const res = await fetch(`${api}/api/profile/me`, {
                method: "PATCH",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${token}`,
                },
                body: JSON.stringify(patch),
            });

            const data = (await res.json()) as PatchMeResponse;
            if (!res.ok) throw new Error(data?.error || "Failed to update profile");

            if (data.profile) {
                const serverProfile = data.profile as P;

                // If server matches keys we set, clear those keys from overlay.
                maybeClearOverlayIfServerMatches(serverProfile, patch);

                // Apply overlay on top of server truth to prevent snapback.
                const merged = applyOverlay(serverProfile)!;

                applyProfilePatch(merged);
                patchProfileByUsername(serverProfile.username, merged);
                setRouteProfile((prev) => (prev ? { ...prev, ...merged } : merged));

                // Safety: if backend is eventually consistent, auto-expire overlay after a bit.
                // (Prevents an overlay sticking forever if server never echoes.)
                const now = Date.now();
                if (Object.keys(pendingOverlayRef.current).length > 0 && now - pendingSinceRef.current > 3000) {
                    pendingOverlayRef.current = {};
                }
            }
        } catch (e: unknown) {
            setLocalError(toErrorMessage(e));

            // On failure: clear overlay and revert to real data
            pendingOverlayRef.current = {};

            await refetchProfile();

            try {
                const u = normalizeUsername(username);
                if (u) {
                    const p = await fetchPublicProfile(u);
                    setRouteProfile(p);
                }
            } catch {
                // ignore
            }
        }
    };

    if (routeLoading || loading) {
        return <LoadingScreen message="Loading profile" progress={-1} />;
    }

    if (routeError || !routeProfile) {
        return (
            <div className="flex items-center justify-center h-screen">
                <p className="text-xl text-red-600">{routeError ? routeError : "Profile not found."}</p>
            </div>
        );
    }


    const pres = getProfilePresentation({
        profile: routeProfile,
        // for safety if routeProfile is ever partial / nullish, still show something
        fallbackName: routeProfile?.displayname || routeProfile?.username || "",
        defaultNameColor: "#3b82f6", // profile page name default
    });

    return (
        <div className="min-h-screen bg-gradient-to-r from-indigo-400 to-blue-700 flex items-center justify-center p-6">
            <div className="max-w-3xl w-full bg-white rounded-xl shadow-2xl overflow-hidden p-6">
                <div className="space-y-8">
                    {/* Profile Header */}
                    <div className="flex items-center space-x-4">
                        <div className="w-16 h-16 flex-shrink-0">
                            <Avatar
                                name={pres.avatar.nameForLetter}
                                color={pres.avatar.bgColor}
                                textColor={pres.avatar.fgColor}
                                icon={pres.avatar.icon}
                                size="16"
                            />
                        </div>
                        <div>
                            <h1
                                className={`text-2xl font-bold ${pres.nameClassName}`}
                                style={pres.nameStyle ?? { color: "#3b82f6" }} // in case name_color isn't hex yet
                            >
                                {pres.displayName}
                            </h1>

                            {isOwnProfile && me?.role === "admin" && (
                                <h3 className="text-sm mt-1 text-red-600">Admin</h3>
                            )}
                        </div>
                    </div>

                    {(localError || boardsLoading) && (
                        <div className="text-sm text-red-600">
                            {localError ? localError : null}
                        </div>
                    )}

                    <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
                        <h3 className="text-lg font-semibold text-gray-800 mb-2">Bio</h3>

                        {isOwnProfile && token ? (
                            <div className="space-y-2">
                                <textarea
                                    value={bioDraft}
                                    onChange={(e) => setBioDraft(e.target.value)}
                                    rows={3}
                                    className="w-full rounded-md border border-gray-300 p-2 text-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-400"
                                    placeholder="Write something about yourself…"
                                    maxLength={280}
                                />
                                <div className="flex items-center justify-between">
                                    <span className="text-xs text-gray-500">{bioDraft.length}/280</span>
                                    <button
                                        type="button"
                                        disabled={savingBio}
                                        onClick={async () => {
                                            setSavingBio(true);
                                            try {
                                                await saveCustomization({ bio: bioDraft.trim().length ? bioDraft.trim() : null });
                                            } finally {
                                                setSavingBio(false);
                                            }
                                        }}
                                        className="px-3 py-2 rounded-md bg-blue-600 text-white font-semibold hover:bg-blue-700 disabled:opacity-60"
                                    >
                                        Save Bio
                                    </button>
                                </div>
                            </div>
                        ) : (
                            <p className="text-gray-700 whitespace-pre-wrap">
                                {routeProfile.bio?.trim()?.length ? routeProfile.bio : (
                                    <span className="italic text-gray-500">No bio yet.</span>
                                )}
                            </p>
                        )}
                    </div>

                    {/* User Settings (only for self) */}
                    {isOwnProfile && (
                        <div>
                            <h2 className="text-2xl font-semibold mb-4 text-gray-800">User Settings</h2>

                            {!token ? (
                                <p className="text-gray-600">Log in to edit your profile colors.</p>
                            ) : (
                                <div className="space-y-6">
                                    <div>
                                        <h3 className="text-xl font-semibold mb-2 text-gray-800">
                                            Icon Background Color
                                        </h3>
                                        <div className="flex flex-wrap gap-2">
                                            {PROFILE_COLOR_OPTIONS.map((c) => (
                                                <button
                                                    key={c}
                                                    type="button"
                                                    className={`w-8 h-8 rounded-full border border-gray-300 cursor-pointer ${
                                                        routeProfile.color === c ? "ring-4 ring-blue-400" : ""
                                                    }`}
                                                    style={{ backgroundColor: c }}
                                                    onClick={() => saveCustomization({ color: c })}
                                                    aria-label={`Set background color ${c}`}
                                                />
                                            ))}
                                        </div>
                                    </div>

                                    <div>
                                        <h3 className="text-xl font-semibold mb-2 text-gray-800">Icon Color</h3>
                                        <div className="flex flex-wrap gap-2">
                                            {PROFILE_COLOR_OPTIONS.map((c) => (
                                                <button
                                                    key={c}
                                                    type="button"
                                                    className={`w-8 h-8 rounded-full border border-gray-300 cursor-pointer ${
                                                        routeProfile.text_color === c ? "ring-4 ring-blue-400" : ""
                                                    }`}
                                                    style={{ backgroundColor: c }}
                                                    onClick={() => saveCustomization({ text_color: c })}
                                                    aria-label={`Set icon color ${c}`}
                                                />
                                            ))}
                                        </div>
                                    </div>

                                    {/* Icon Picker */}
                                    <div>
                                        <h3 className="text-xl font-semibold mb-2 text-gray-800">Icon</h3>

                                        <div className="flex flex-wrap gap-2">
                                            {PROFILE_ICON_OPTIONS.map((icon) => {
                                                const selected = (routeProfile.icon ?? "letter") === icon;

                                                return (
                                                    <button
                                                        key={icon}
                                                        type="button"
                                                        className={[
                                                            "w-11 h-11 rounded-lg border border-gray-300",
                                                            "flex items-center justify-center",
                                                            "bg-white hover:bg-gray-50",
                                                            selected ? "ring-4 ring-blue-400" : "",
                                                        ].join(" ")}
                                                        onClick={() => saveCustomization({ icon })}
                                                        aria-label={`Set icon ${icon}`}
                                                        title={icon}
                                                    >
                                                        {icon === "letter" ? (
                                                            <span className={pres.iconColorClass} style={pres.iconColorStyle}>
                                                              {pres.displayName?.charAt(0).toUpperCase()}
                                                            </span>
                                                        ) : (
                                                            <ProfileIcon
                                                                name={icon}
                                                                className={["w-6 h-6", pres.iconColorClass].join(" ").trim()}
                                                                style={pres.iconColorStyle}
                                                                title={icon}
                                                            />
                                                        )}
                                                    </button>
                                                );
                                            })}
                                        </div>
                                    </div>



                                    {/* Font Picker */}
                                    <div>
                                        <h3 className="text-xl font-semibold mb-2 text-gray-800">Font</h3>
                                        <div className="flex flex-wrap gap-2">
                                            {PROFILE_FONT_OPTIONS.map((f) => (
                                                <button
                                                    key={f.id}
                                                    type="button"
                                                    className={[
                                                        "px-3 py-2 rounded-lg border border-gray-300",
                                                        "bg-white text-gray-900 hover:bg-gray-50",
                                                        "text-sm font-semibold",
                                                        routeProfile.font === f.id ? "ring-4 ring-blue-400" : "",
                                                        f.css,
                                                    ].join(" ")}
                                                    onClick={() => saveCustomization({ font: f.id })}
                                                >
                                                    {f.label}
                                                </button>

                                            ))}
                                        </div>
                                    </div>
                                    {/* Font Color */}
                                    <div>
                                        <h3 className="text-xl font-semibold mb-2 text-gray-800">Name Color</h3>
                                        <div className="flex flex-wrap gap-2">
                                            {PROFILE_COLOR_OPTIONS.map((c) => (
                                                <button
                                                    key={c}
                                                    type="button"
                                                    className={`w-8 h-8 rounded-full border border-gray-300 cursor-pointer ${
                                                        (routeProfile.name_color ?? "#3b82f6") === c ? "ring-4 ring-blue-400" : ""
                                                    }`}
                                                    style={{ backgroundColor: c }}
                                                    onClick={() => saveCustomization({ name_color: c })}
                                                    aria-label={`Set name color ${c}`}
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
                        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                            <div className="bg-gray-100 p-4 rounded-lg shadow">
                                <p className="text-gray-800">Boards Generated</p>
                                <p className="text-lg font-semibold text-gray-900">
                                    {routeProfile.boards_generated ?? 0}
                                </p>
                            </div>
                            <div className="bg-gray-100 p-4 rounded-lg shadow">
                                <p className="text-gray-800">Games Finished</p>
                                <p className="text-lg font-semibold text-gray-900">
                                    {routeProfile.games_finished ?? 0}
                                </p>
                            </div>
                            <div className="bg-gray-100 p-4 rounded-lg shadow">
                                <p className="text-gray-800">Games Won</p>
                                <p className="text-lg font-semibold text-gray-900">
                                    {routeProfile.games_won ?? 0}
                                </p>
                            </div>
                            <div className="bg-gray-100 p-4 rounded-lg shadow">
                                <p className="text-gray-800">Money Won</p>
                                <p className="text-lg font-semibold text-gray-900">
                                    ${routeProfile.money_won?.toLocaleString() ?? 0}
                                </p>
                            </div>
                        </div>
                    </div>

                    {/* Recently Generated Boards */}
                    <div>
                        <div className="flex items-center justify-between mb-4">
                            <h2 className="text-2xl font-semibold text-gray-800">Recently Generated Boards</h2>

                            <Link
                                to={`/profile/${routeProfile.username}/history`}
                                className="px-4 py-2 rounded-lg bg-blue-600 text-white font-semibold hover:bg-blue-700 transition-colors"
                            >
                                View full history
                            </Link>
                        </div>

                        <div className="space-y-4">
                            {boardsLoading ? (
                                <p className="text-gray-600 italic">Loading boards…</p>
                            ) : boards.length > 0 ? (
                                boards.map((board, idx) => <ProfileGameCard key={idx} game={board} />)
                            ) : (
                                <p className="text-gray-600 italic">No boards generated yet.</p>
                            )}
                        </div>
                    </div>

                    {error && (
                        <div className="text-xs text-gray-500">
                            Session profile warning: {error}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default Profile;

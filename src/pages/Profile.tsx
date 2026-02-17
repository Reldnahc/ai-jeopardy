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
} from "../utils/profilePresentation.ts";
import { PROFILE_ICON_OPTIONS } from "../components/common/profileIcons";

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

type ColorTarget = "color" | "text_color" | "name_color";

const COLOR_TARGETS: Array<{ key: ColorTarget; label: string; defaultHex: string }> = [
    { key: "color", label: "Icon Background", defaultHex: "#3b82f6" },
    { key: "text_color", label: "Icon Color", defaultHex: "#ffffff" },
    { key: "name_color", label: "Name Color", defaultHex: "#3b82f6" },
];

function normalizeHex(input: string, fallback: string) {
    const s = String(input ?? "").trim();
    if (!s) return fallback;
    if (/^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(s)) return s.toLowerCase();
    return fallback;
}

const Profile: React.FC = () => {
    const { username } = useParams<RouteParams>();
    const { user, token } = useAuth();

    // IMPORTANT:
    // `profile` here should remain "me" (authenticated user's profile)
    const {
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
    const [routeGaveUp, setRouteGaveUp] = useState(false);
    const [retryTick, setRetryTick] = useState(0);

    const [settingsOpen, setSettingsOpen] = useState(false);

    const [colorTarget, setColorTarget] = useState<ColorTarget>("color");
    const [hexDraft, setHexDraft] = useState<string>("#3b82f6");

    // Viewing "my" profile if the route profile id matches the logged-in user id
    const isOwnProfile = useMemo(() => {
        return Boolean(user?.id && routeProfile?.id && user.id === routeProfile.id);
    }, [user?.id, routeProfile?.id]);

    const fetchSeq = useRef(0);
    const fetchPublicProfileRef = useRef(fetchPublicProfile);

    /**
     * Pending customization overlay to prevent UI "snap back"
     * when backend briefly returns stale profile values.
     */
    const pendingOverlayRef = useRef<CustomPatch>({});
    const pendingSinceRef = useRef<number>(0);

    const getSavedHexForTarget = (p: P, target: ColorTarget) => {
        const meta = COLOR_TARGETS.find((t) => t.key === target)!;
        const current = (p[target] ?? meta.defaultHex) as string;
        return normalizeHex(current, meta.defaultHex);
    };

    const cancelHexDraft = () => {
        if (!routeProfile) return;
        setHexDraft(getSavedHexForTarget(routeProfile, colorTarget));
    };

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

    useEffect(() => {
        fetchPublicProfileRef.current = fetchPublicProfile;
    }, [fetchPublicProfile]);

    // Load route profile, but be resilient on refresh:
    // - retry for ~3s
    // - treat null as failure
    // - don't nuke an already-rendered profile during transient failures
    useEffect(() => {
        const u = normalizeUsername(username);
        if (!u) return;

        const mySeq = ++fetchSeq.current;
        let cancelled = false;

        setRouteGaveUp(false);
        setRouteError(null);

        const attemptOnce = async (): Promise<boolean> => {
            setRouteLoading(true);

            try {
                const p = await fetchPublicProfileRef.current(u);

                if (cancelled || mySeq !== fetchSeq.current) return false;

                // ✅ IMPORTANT: null/undefined is NOT success
                if (!p) {
                    setRouteError("Profile not found (yet). Retrying…");
                    return false;
                }

                setRouteProfile(applyOverlay(p));
                setRouteError(null);
                return true;
            } catch (e: unknown) {
                if (cancelled || mySeq !== fetchSeq.current) return false;
                setRouteError(toErrorMessage(e));
                return false;
            } finally {
                if (!cancelled && mySeq === fetchSeq.current) setRouteLoading(false);
            }
        };

        void (async () => {
            let ok = false;

            // Fast initial attempt
            ok = await attemptOnce();

            // If it failed AND we don't already have a profile rendered, retry a bit.
            // (If we *do* have a profile, don't spam retries; just keep displaying it.)
            if (!ok && !routeProfile) {
                for (let i = 0; i < 9; i++) {
                    if (cancelled || mySeq !== fetchSeq.current) return;
                    await new Promise((r) => setTimeout(r, 300));
                    ok = await attemptOnce();
                    if (ok) break;
                }
            }

            if (!ok && !cancelled && mySeq === fetchSeq.current && !routeProfile) {
                setRouteGaveUp(true);
            }
        })();

        return () => {
            cancelled = true;
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [username, retryTick]);

    // Keep bioDraft in sync with the DISPLAYED profile (routeProfile), not "me"
    useEffect(() => {
        setBioDraft(routeProfile?.bio ?? "");
    }, [routeProfile?.bio, routeProfile?.id]);

    // Keep unified color picker hexDraft in sync with routeProfile and selected target
    useEffect(() => {
        if (!routeProfile) return;
        const meta = COLOR_TARGETS.find((t) => t.key === colorTarget)!;
        const current = (routeProfile[colorTarget] ?? meta.defaultHex) as string;
        setHexDraft(normalizeHex(current, meta.defaultHex));
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [routeProfile?.id, routeProfile?.color, routeProfile?.text_color, routeProfile?.name_color, colorTarget]);

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

                maybeClearOverlayIfServerMatches(serverProfile, patch);

                const merged = applyOverlay(serverProfile)!;

                applyProfilePatch(merged);
                patchProfileByUsername(serverProfile.username, merged);
                setRouteProfile((prev) => (prev ? { ...prev, ...merged } : merged));

                const now = Date.now();
                if (
                    Object.keys(pendingOverlayRef.current).length > 0 &&
                    now - pendingSinceRef.current > 3000
                ) {
                    pendingOverlayRef.current = {};
                }
            }
        } catch (e: unknown) {
            setLocalError(toErrorMessage(e));

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

    const commitHexDraft = async () => {
        const meta = COLOR_TARGETS.find((t) => t.key === colorTarget)!;
        const next = normalizeHex(hexDraft, meta.defaultHex);
        setHexDraft(next);

        const patch: CustomPatch =
            colorTarget === "color"
                ? { color: next }
                : colorTarget === "text_color"
                    ? { text_color: next }
                    : { name_color: next };

        await saveCustomization(patch);
    };

    // ---- Render guards ----

    // If we already have a profile, keep showing it even if background loading happens.
    if (!routeProfile && (routeLoading || loading) && !routeGaveUp) {
        return <LoadingScreen message="Loading profile" progress={-1} />;
    }

    // If we gave up and still don't have a profile, show a real error screen.
    if (!routeProfile && routeGaveUp) {
        return (
            <div className="flex items-center justify-center h-screen p-6">
                <div className="max-w-md w-full bg-white rounded-xl shadow p-6">
                    <div className="text-xl font-semibold text-gray-900">Couldn’t load profile</div>
                    <div className="mt-2 text-sm text-red-600">{routeError ?? "Unknown error"}</div>

                    <div className="mt-4 flex gap-2">
                        <button
                            type="button"
                            className="px-4 py-2 rounded-lg bg-blue-600 text-white font-semibold hover:bg-blue-700"
                            onClick={() => {
                                setRouteGaveUp(false);
                                setRetryTick((n) => n + 1);
                            }}
                        >
                            Retry
                        </button>

                        <Link
                            to="/"
                            className="px-4 py-2 rounded-lg border border-gray-300 bg-white text-gray-900 font-semibold hover:bg-gray-50"
                        >
                            Go home
                        </Link>
                    </div>
                </div>
            </div>
        );
    }

    // Safety: if we somehow get here with no profile, show a loading screen instead of "not found" flicker
    if (!routeProfile) {
        return <LoadingScreen message="Loading profile" progress={-1} />;
    }

    const pres = getProfilePresentation({
        profile: routeProfile,
        fallbackName: routeProfile?.displayname || routeProfile?.username || "",
        defaultNameColor: "#3b82f6",
    });

    const nameColorMeta = COLOR_TARGETS.find((t) => t.key === "name_color")!;
    const nameHexForFontPreview = normalizeHex(
        String(routeProfile.name_color ?? nameColorMeta.defaultHex),
        nameColorMeta.defaultHex
    );

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
                                className={`text-4xl font-bold ${pres.nameClassName}`}
                                style={pres.nameStyle ?? { color: "#3b82f6" }}
                            >
                                {pres.displayName}
                            </h1>

                            {routeProfile?.role === "admin" ||  (
                                <h3 className="text-sm -mt-2 text-red-600">Admin</h3>
                            )}

                        </div>
                    </div>

                    {(localError || boardsLoading) && (
                        <div className="text-sm text-red-600">{localError ? localError : null}</div>
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
                                                await saveCustomization({
                                                    bio: bioDraft.trim().length ? bioDraft.trim() : null,
                                                });
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
                                {routeProfile.bio?.trim()?.length ? (
                                    routeProfile.bio
                                ) : (
                                    <span className="italic text-gray-500">No bio yet.</span>
                                )}
                            </p>
                        )}
                    </div>

                    {/* User Settings (only for self) */}
                    {isOwnProfile && (
                        <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
                            <div className="flex items-center justify-between">
                                <div>
                                    <h2 className="text-2xl font-semibold text-gray-800">User Settings</h2>
                                    <p className="text-sm text-gray-600 mt-1">Colors, icon, and font</p>
                                </div>

                                <button
                                    type="button"
                                    onClick={() => setSettingsOpen((prev) => !prev)}
                                    className="px-4 py-2 rounded-lg bg-blue-600 text-white font-semibold hover:bg-blue-700 transition-colors"
                                >
                                    {settingsOpen ? "Hide" : "Edit"}
                                </button>
                            </div>

                            {settingsOpen && (
                                <div className="mt-4">
                                    {!token ? (
                                        <p className="text-gray-600">Log in to edit your profile colors.</p>
                                    ) : (
                                        <div className="space-y-6">
                                            {/* Unified Color Picker */}
                                            <div>
                                                <h3 className="text-xl font-semibold mb-2 text-gray-800">Colors</h3>

                                                <div className="flex flex-wrap gap-2 mb-3">
                                                    {COLOR_TARGETS.map((t) => {
                                                        const active = colorTarget === t.key;
                                                        return (
                                                            <button
                                                                key={t.key}
                                                                type="button"
                                                                onClick={() => setColorTarget(t.key)}
                                                                className={[
                                                                    "px-3 py-2 rounded-lg border",
                                                                    "text-sm font-semibold transition-colors",
                                                                    active
                                                                        ? "bg-blue-600 text-white border-blue-600"
                                                                        : "bg-white text-gray-900 border-gray-300 hover:bg-gray-50",
                                                                ].join(" ")}
                                                            >
                                                                {t.label}
                                                            </button>
                                                        );
                                                    })}
                                                </div>

                                                <div className="grid grid-cols-1 md:grid-cols-[auto,auto,1fr,auto] items-center gap-3 mb-3">
                                                    <input
                                                        type="color"
                                                        value={normalizeHex(hexDraft, "#3b82f6")}
                                                        onChange={(e) => {
                                                            const meta = COLOR_TARGETS.find((t) => t.key === colorTarget)!;
                                                            const next = normalizeHex(e.target.value, meta.defaultHex);
                                                            setHexDraft(next);
                                                        }}
                                                        className="w-12 h-10 p-1 rounded-md border border-gray-300 bg-white cursor-pointer"
                                                        aria-label="Pick color"
                                                        title="Pick color"
                                                    />

                                                    <input
                                                        value={hexDraft}
                                                        onChange={(e) => setHexDraft(e.target.value)}
                                                        onKeyDown={(e) => {
                                                            if (e.key === "Enter") void commitHexDraft();
                                                            if (e.key === "Escape") cancelHexDraft();
                                                        }}
                                                        className="w-36 rounded-md border border-gray-300 p-2 text-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-400"
                                                        placeholder="#3b82f6"
                                                        aria-label="Hex color"
                                                    />

                                                    <div className="flex items-center justify-end gap-2">
                                                        <button
                                                            type="button"
                                                            onClick={cancelHexDraft}
                                                            className="px-3 py-2 rounded-md border border-gray-300 bg-white text-gray-900 font-semibold hover:bg-gray-50"
                                                        >
                                                            Cancel
                                                        </button>

                                                        <button
                                                            type="button"
                                                            onClick={() => void commitHexDraft()}
                                                            className="px-3 py-2 rounded-md bg-blue-600 text-white font-semibold hover:bg-blue-700"
                                                        >
                                                            Apply
                                                        </button>
                                                    </div>
                                                </div>

                                                <div className="flex flex-wrap gap-2">
                                                    {PROFILE_COLOR_OPTIONS.map((c) => {
                                                        const meta = COLOR_TARGETS.find((t) => t.key === colorTarget)!;
                                                        const normalized = normalizeHex(c, meta.defaultHex);
                                                        const selected = normalizeHex(hexDraft, meta.defaultHex) === normalized;

                                                        return (
                                                            <button
                                                                key={`${colorTarget}-${c}`}
                                                                type="button"
                                                                className={[
                                                                    "w-8 h-8 rounded-full border border-gray-300 cursor-pointer",
                                                                    selected ? "ring-4 ring-blue-400" : "",
                                                                ].join(" ")}
                                                                style={{ backgroundColor: normalized }}
                                                                onClick={() => {
                                                                    setHexDraft(normalized);
                                                                }}
                                                                aria-label={`Set ${colorTarget} to ${normalized}`}
                                                                title={normalized}
                                                            />
                                                        );
                                                    })}
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
                                                                "bg-white hover:bg-gray-50",
                                                                "text-sm font-semibold",
                                                                routeProfile.font === f.id ? "ring-4 ring-blue-400" : "",
                                                            ].join(" ")}
                                                            onClick={() => saveCustomization({ font: f.id })}
                                                        >
                                                            <span className={f.css} style={{ color: nameHexForFontPreview }}>
                                                                {f.label}
                                                            </span>
                                                        </button>
                                                    ))}
                                                </div>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    )}

                    {/* Player Stats */}
                    <div>
                        <div className="flex items-center justify-between mb-4">
                            <h2 className="text-2xl font-semibold text-gray-800">Player Stats</h2>

                            <Link
                                to={`/profile/${routeProfile.username}/stats`}
                                className="px-4 py-2 rounded-lg bg-blue-600 text-white font-semibold hover:bg-blue-700 transition-colors"
                            >
                                View full stats
                            </Link>
                        </div>

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

                    {error && <div className="text-xs text-gray-500">Session profile warning: {error}</div>}
                </div>
            </div>
        </div>
    );
};

export default Profile;

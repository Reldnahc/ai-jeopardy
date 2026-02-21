// src/pages/profile/useProfilePageController.ts
import { useEffect, useMemo, useRef, useState } from "react";
import type { Board } from "../../types/Board";
import { Profile as P, useProfile } from "../../contexts/ProfileContext";
import { useAuth } from "../../contexts/AuthContext";
import type { LadderRole, Role } from "../../../shared/roles";
import { LADDER_ROLES, normalizeRole, rank, atLeast } from "../../../shared/roles";
import { getProfilePresentation } from "../../utils/profilePresentation";

// --- Types (kept consistent with your original page) -----------------

type CustomField =
  | "color"
  | "text_color"
  | "name_color"
  | "bio"
  | "font"
  | "icon"
  | "border"
  | "border_color"
  | "background_color";

export type CustomPatch = Partial<Pick<P, CustomField>>;
type ModerationField = "bio" | "role";
type ModerationPatch = Partial<Pick<P, ModerationField>>;

type PatchMeResponse = { profile?: P; error?: string };

// Derive these keys from literals so TS allows safe indexing on Profile
export type ColorTarget = Extract<
  CustomField,
  "color" | "text_color" | "name_color" | "border_color" | "background_color"
>;

export const COLOR_TARGETS: Array<{ key: ColorTarget; label: string; defaultHex: string }> = [
  { key: "color", label: "Icon Background", defaultHex: "#3b82f6" },
  { key: "text_color", label: "Icon Color", defaultHex: "#ffffff" },
  { key: "name_color", label: "Name Color", defaultHex: "#3b82f6" },
  { key: "border_color", label: "Border Color", defaultHex: "#000000" },
  { key: "background_color", label: "Background Color", defaultHex: "#f2f2f2" },
];

// --- Small helpers ---------------------------------------------------

function getApiBase() {
  if (import.meta.env.DEV) return import.meta.env.VITE_API_BASE || "http://localhost:3002";
  return "";
}

function normalizeUsername(u: unknown) {
  return String(u ?? "")
    .trim()
    .toLowerCase();
}

function toErrorMessage(e: unknown) {
  if (e instanceof Error) return e.message;
  return String(e);
}

export function normalizeHex(input: string, fallback: string) {
  const s = String(input ?? "").trim();
  if (!s) return fallback;
  if (/^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(s)) return s.toLowerCase();
  return fallback;
}

function asLadderRole(role: Role): LadderRole {
  return role === "banned" ? "default" : role;
}

function useRoleGate(rawRole: unknown) {
  const role = normalizeRole(rawRole); // Role (may be "banned")
  const ladder = asLadderRole(role);
  return {
    role,
    ladder,
    atLeast: (min: LadderRole) => atLeast(ladder, min),
    rank: rank(ladder),
  };
}

export function prettyRoleLabel(r: string) {
  switch (r) {
    case "head_admin":
      return "Head Admin";
    default:
      return r.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
  }
}

function colorPatch(target: ColorTarget, value: string): Pick<P, ColorTarget> {
  return { [target]: value } as Pick<P, ColorTarget>;
}

// --- Hook ------------------------------------------------------------

export function useProfilePageController(usernameParam: string | undefined) {
  const { user, token } = useAuth();

  // NOTE: your ProfileContext hook appears to expose both `profile` and methods.
  // You were calling it twice; we keep it once.
  const {
    profile,
    loading,
    error,
    applyProfilePatch,
    refetchProfile,
    fetchPublicProfile,
    patchProfileByUsername,
  } = useProfile();

  const viewerGate = useRoleGate(user?.role ?? profile?.role ?? null);

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

  const [promoteOpen, setPromoteOpen] = useState(false);
  const [banOpen, setBanOpen] = useState(false);

  // Use Role directly to avoid casts when patching role
  const [promoteDraft, setPromoteDraft] = useState<Role | "">("");
  const [banCheck, setBanCheck] = useState(false);

  const isOwnProfile = useMemo(
    () => Boolean(user?.id && routeProfile?.id && user.id === routeProfile.id),
    [user?.id, routeProfile?.id],
  );

  const fetchSeq = useRef(0);
  const fetchPublicProfileRef = useRef(fetchPublicProfile);

  /**
   * Pending overlay is used to prevent UI "snap back" while backend/caches catch up.
   * It must support BOTH customization and moderation fields -> Partial<P>.
   */
  const pendingOverlayRef = useRef<Partial<P>>({});
  const pendingSinceRef = useRef<number>(0);

  function applyOverlay(p: P | null): P | null {
    if (!p) return p;
    const overlay = pendingOverlayRef.current;
    if (!overlay || Object.keys(overlay).length === 0) return p;
    return { ...p, ...overlay };
  }

  function addOverlay(patch: Partial<P>) {
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

  const getSavedHexForTarget = (p: P, target: ColorTarget) => {
    const meta = COLOR_TARGETS.find((t) => t.key === target)!;
    const current = (p[target] ?? meta.defaultHex) as string;
    return normalizeHex(current, meta.defaultHex);
  };

  const cancelHexDraft = () => {
    if (!routeProfile) return;
    setHexDraft(getSavedHexForTarget(routeProfile, colorTarget));
  };

  // Keep fetch func ref fresh
  useEffect(() => {
    fetchPublicProfileRef.current = fetchPublicProfile;
  }, [fetchPublicProfile]);

  // Load route profile resiliently
  useEffect(() => {
    const u = normalizeUsername(usernameParam);
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
      let ok = await attemptOnce();

      if (!ok && !routeProfile) {
        for (let i = 0; i < 9; i++) {
          if (cancelled || mySeq !== fetchSeq.current) return;
          await new Promise((r) => setTimeout(r, 300));
          ok = await attemptOnce();
          if (ok) break;
        }
      }

      if (!ok && !cancelled && mySeq === fetchSeq.current && !routeProfile) setRouteGaveUp(true);
    })();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [usernameParam, retryTick]);

  // bioDraft follows displayed route profile
  useEffect(() => {
    setBioDraft(routeProfile?.bio ?? "");
  }, [routeProfile?.bio, routeProfile?.id]);

  // hexDraft follows target + routeProfile changes
  useEffect(() => {
    if (!routeProfile) return;
    const meta = COLOR_TARGETS.find((t) => t.key === colorTarget)!;
    const current = routeProfile[colorTarget] ?? meta.defaultHex;
    setHexDraft(normalizeHex(String(current), meta.defaultHex));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    routeProfile?.id,
    routeProfile?.color,
    routeProfile?.text_color,
    routeProfile?.name_color,
    routeProfile?.border_color,
    routeProfile?.background_color,
    colorTarget,
  ]);

  // Boards
  useEffect(() => {
    const run = async () => {
      try {
        setBoardsLoading(true);
        setLocalError(null);

        const u = normalizeUsername(usernameParam);
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
  }, [usernameParam]);

  const saveCustomization = async (patch: CustomPatch) => {
    if (!token) return;

    // overlay first to prevent snap-back
    addOverlay(patch);

    // optimistic UI
    setRouteProfile((prev) => (prev ? applyOverlay({ ...prev, ...patch }) : prev));

    // cache updates (assumed to accept Partial<P> — if yours is narrower, widen it)
    applyProfilePatch(patch);
    if (routeProfile?.username) patchProfileByUsername(routeProfile.username, patch);

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
        const serverProfile = data.profile;

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
        const u = normalizeUsername(usernameParam);
        if (u) {
          const p = await fetchPublicProfile(u);
          setRouteProfile(p);
        }
      } catch {
        // ignore
      }
    }
  };

  const patchAnyProfile = async (targetUsername: string, patch: ModerationPatch) => {
    if (!token) return;

    addOverlay(patch);

    setRouteProfile((prev) => (prev ? applyOverlay({ ...prev, ...patch }) : prev));

    // cache updates (assumed to accept Partial<P>)
    applyProfilePatch(patch);
    patchProfileByUsername(targetUsername, patch);

    try {
      const api = getApiBase();
      const res = await fetch(`${api}/api/profile/${encodeURIComponent(targetUsername)}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(patch),
      });

      const data = (await res.json()) as { profile?: P; error?: string };
      if (!res.ok) throw new Error(data?.error || "Failed to update profile");

      if (data.profile) {
        const serverProfile = data.profile;
        const merged = applyOverlay(serverProfile)!;

        applyProfilePatch(merged);
        patchProfileByUsername(serverProfile.username, merged);
        setRouteProfile((prev) => (prev ? { ...prev, ...merged } : merged));
      }
    } catch (e: unknown) {
      setLocalError(toErrorMessage(e));
      pendingOverlayRef.current = {};
      await refetchProfile();
    }
  };

  const commitHexDraft = async () => {
    const meta = COLOR_TARGETS.find((t) => t.key === colorTarget)!;
    const next = normalizeHex(hexDraft, meta.defaultHex);
    setHexDraft(next);
    await saveCustomization(colorPatch(colorTarget, next));
  };

  // Derived view state
  const pres = useMemo(() => {
    if (!routeProfile) return null;
    return getProfilePresentation({
      profile: routeProfile,
      fallbackName: routeProfile.displayname || routeProfile.username || "",
      defaultNameColor: "#3b82f6",
    });
  }, [routeProfile]);

  const targetRole: Role = normalizeRole(routeProfile?.role);
  const targetLadder: LadderRole = asLadderRole(targetRole);

  const viewerRank = viewerGate.rank;
  const targetRank = rank(targetLadder);

  const canTouchTarget = viewerRank > targetRank;

  const canModerate = viewerGate.atLeast("moderator") && canTouchTarget;
  const canPromote = viewerGate.atLeast("privileged") && canTouchTarget; // mods cannot promote
  const canBan = viewerGate.atLeast("moderator") && canTouchTarget;

  const viewerIsCreator = viewerGate.role === "creator";

  const promotableRoles: (LadderRole | "banned")[] = viewerIsCreator
    ? [...LADDER_ROLES, "banned"]
    : (LADDER_ROLES.filter((r) => rank(r) < viewerRank) as LadderRole[]);

  const targetNormalizedRole = normalizeRole(routeProfile?.role);
  const promotableRolesFiltered = promotableRoles.filter((r) => r !== targetNormalizedRole);

  const canShowPromote = canPromote && promotableRolesFiltered.length > 0;

  const doDeleteBio = async () => {
    if (!routeProfile) return;
    await patchAnyProfile(routeProfile.username, { bio: "" });
  };

  const doPromote = async () => {
    if (!routeProfile) return;
    if (!promoteDraft) return;
    await patchAnyProfile(routeProfile.username, { role: promoteDraft });
  };

  const doBan = async () => {
    if (!routeProfile) return;
    await patchAnyProfile(routeProfile.username, { role: "banned" });
  };

  const roleMeta: Record<LadderRole | "banned", { label: string; className: string }> = {
    default: { label: "Player", className: "text-gray-600" },
    moderator: { label: "Moderator", className: "text-blue-600" },
    privileged: { label: "Privileged", className: "text-emerald-600" },
    admin: { label: "Admin", className: "text-red-500" },
    head_admin: { label: "Head Admin", className: "text-amber-700" },
    creator: { label: "Creator", className: "text-purple-600" },
    banned: { label: "Banned", className: "text-red-800 line-through" },
  };

  const normalizedRouteRole = normalizeRole(routeProfile?.role);
  const roleInfo = roleMeta[normalizedRouteRole];

  const nameColorMeta = COLOR_TARGETS.find((t) => t.key === "name_color")!;
  const nameHexForFontPreview = normalizeHex(
    String(routeProfile?.name_color ?? nameColorMeta.defaultHex),
    nameColorMeta.defaultHex,
  );

  return {
    // loading guards
    loading,
    error,
    routeLoading,
    routeError,
    routeGaveUp,
    retry: () => {
      setRouteGaveUp(false);
      setRetryTick((n) => n + 1);
    },

    // data
    token,
    routeProfile,
    pres,
    boards,
    boardsLoading,
    localError,

    // ownership
    isOwnProfile,

    // bio
    bioDraft,
    setBioDraft,
    savingBio,
    setSavingBio,

    // customization
    settingsOpen,
    setSettingsOpen,
    colorTarget,
    setColorTarget,
    hexDraft,
    setHexDraft,
    cancelHexDraft,
    commitHexDraft,
    saveCustomization,
    nameHexForFontPreview,

    // exported helpers/constants for the customization panel (avoid duplication)
    COLOR_TARGETS,
    normalizeHex,

    // moderation
    canModerate,
    canShowPromote,
    canBan,
    promoteOpen,
    setPromoteOpen,
    promoteDraft,
    setPromoteDraft,
    promotableRolesFiltered: promotableRolesFiltered.map(String),
    banOpen,
    setBanOpen,
    banCheck,
    setBanCheck,
    doDeleteBio,
    doPromote,
    doBan,
    roleInfo,
  };
}

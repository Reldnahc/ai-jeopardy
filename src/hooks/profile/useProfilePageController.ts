import { useEffect, useMemo, useState } from "react";
import type { Board } from "../../types/Board";
import { Profile as P, useProfile } from "../../contexts/ProfileContext";
import { useAuth } from "../../contexts/AuthContext";
import type { LadderRole, Role } from "../../../shared/roles";
import { LADDER_ROLES, normalizeRole, rank } from "../../../shared/roles";
import { getProfilePresentation } from "../../utils/profilePresentation";
import {
  COLOR_TARGETS,
  asLadderRole,
  colorPatch,
  getApiBase,
  normalizeHex,
  normalizeUsername,
  prettyRoleLabel,
  toErrorMessage,
  useRoleGate,
  type ColorTarget,
  type CustomPatch,
  type ModerationPatch,
  type PatchMeResponse,
} from "./profilePageController.shared";
import { useProfileOverlay } from "./useProfileOverlay";
import { useRouteProfileLoader } from "./useRouteProfileLoader";

export { COLOR_TARGETS, normalizeHex, prettyRoleLabel };
export type { ColorTarget, CustomPatch };

export function useProfilePageController(usernameParam: string | undefined) {
  const { user, token } = useAuth();

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

  const [settingsOpen, setSettingsOpen] = useState(false);
  const [colorTarget, setColorTarget] = useState<ColorTarget>("color");
  const [hexDraft, setHexDraft] = useState<string>("#3b82f6");

  const [promoteOpen, setPromoteOpen] = useState(false);
  const [banOpen, setBanOpen] = useState(false);
  const [promoteDraft, setPromoteDraft] = useState<LadderRole | "">("");
  const [banCheck, setBanCheck] = useState(false);

  const {
    pendingOverlayRef,
    pendingSinceRef,
    applyOverlay,
    addOverlay,
    clearOverlay,
    maybeClearOverlayIfServerMatches,
  } = useProfileOverlay<P>();

  const {
    routeProfile,
    setRouteProfile,
    routeLoading,
    routeError,
    routeGaveUp,
    retry,
  } = useRouteProfileLoader({ usernameParam, fetchPublicProfile, applyOverlay });

  const isOwnProfile = useMemo(
    () => Boolean(user?.id && routeProfile?.id && user.id === routeProfile.id),
    [user?.id, routeProfile?.id],
  );

  const getSavedHexForTarget = (p: P, target: ColorTarget) => {
    const meta = COLOR_TARGETS.find((t) => t.key === target)!;
    const current = (p[target] ?? meta.defaultHex) as string;
    return normalizeHex(current, meta.defaultHex);
  };

  const cancelHexDraft = () => {
    if (!routeProfile) return;
    setHexDraft(getSavedHexForTarget(routeProfile, colorTarget));
  };

  useEffect(() => {
    setBioDraft(routeProfile?.bio ?? "");
  }, [routeProfile?.bio, routeProfile?.id]);

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

    addOverlay(patch);
    setRouteProfile((prev) => (prev ? applyOverlay({ ...prev, ...patch }) : prev));

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
          clearOverlay();
        }
      }
    } catch (e: unknown) {
      setLocalError(toErrorMessage(e));
      clearOverlay();

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
      clearOverlay();
      await refetchProfile();
    }
  };

  const commitHexDraft = async () => {
    const meta = COLOR_TARGETS.find((t) => t.key === colorTarget)!;
    const next = normalizeHex(hexDraft, meta.defaultHex);
    setHexDraft(next);
    await saveCustomization(colorPatch(colorTarget, next));
  };

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
  const canPromote = viewerGate.atLeast("privileged") && canTouchTarget;
  const canBan = viewerGate.atLeast("moderator") && canTouchTarget;

  const viewerIsCreator = viewerGate.role === "creator";

  const promotableRoles: LadderRole[] = viewerIsCreator
    ? [...LADDER_ROLES]
    : (LADDER_ROLES.filter((r) => rank(r) < viewerRank) as LadderRole[]);

  const targetNormalizedRole = normalizeRole(routeProfile?.role);
  const promotableRolesFiltered = promotableRoles.filter((r) => r !== targetNormalizedRole);

  const canShowPromote = canPromote && promotableRolesFiltered.length > 0;

  const doDeleteBio = async () => {
    if (!routeProfile) return;
    await patchAnyProfile(routeProfile.username, { bio: "" });
  };

  const doPromote = async () => {
    if (!routeProfile || !promoteDraft) return;
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
    loading,
    error,
    routeLoading,
    routeError,
    routeGaveUp,
    retry,

    token,
    routeProfile,
    pres,
    boards,
    boardsLoading,
    localError,

    isOwnProfile,

    bioDraft,
    setBioDraft,
    savingBio,
    setSavingBio,

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

    COLOR_TARGETS,
    normalizeHex,

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

import { useEffect, useMemo, useState } from "react";
import type { Board } from "../../types/Board";
import { Profile as P, useProfile } from "../../contexts/ProfileContext";
import { useAuth } from "../../contexts/AuthContext";
import { LadderRole } from "../../../shared/roles";
import { getProfilePresentation } from "../../utils/profilePresentation";
import {
  COLOR_TARGETS,
  colorPatch,
  normalizeHex,
  prettyRoleLabel,
  useRoleGate,
  type ColorTarget,
  type CustomPatch,
} from "./profilePageController.shared";
import {
  buildProfileRoleState,
  getNameHexForFontPreview,
  getSavedHexForTarget,
  loadProfileBoards,
} from "./profilePageController.helpers";
import { useProfilePageMutations } from "./useProfilePageMutations";
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

  const { routeProfile, setRouteProfile, routeLoading, routeError, routeGaveUp, retry } =
    useRouteProfileLoader({ usernameParam, fetchPublicProfile, applyOverlay });

  const isOwnProfile = useMemo(
    () => Boolean(user?.id && routeProfile?.id && user.id === routeProfile.id),
    [user?.id, routeProfile?.id],
  );

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
      setBoardsLoading(true);
      setLocalError(null);

      const result = await loadProfileBoards(usernameParam);
      setBoards(result.boards);
      setLocalError(result.error);
      setBoardsLoading(false);
    };

    void run();
  }, [usernameParam]);

  const { saveCustomization, patchAnyProfile } = useProfilePageMutations({
    token,
    usernameParam,
    routeProfile,
    applyOverlay,
    addOverlay,
    clearOverlay,
    maybeClearOverlayIfServerMatches,
    pendingOverlayRef,
    pendingSinceRef,
    setRouteProfile,
    setLocalError,
    applyProfilePatch,
    patchProfileByUsername,
    refetchProfile,
    fetchPublicProfile,
  });

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
  const {
    canModerate,
    canShowPromote,
    canBan,
    promotableRolesFiltered,
    roleInfo,
  } = buildProfileRoleState({
    viewerRank: viewerGate.rank,
    viewerRole: viewerGate.role,
    targetRoleRaw: routeProfile?.role,
  });

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
  const nameHexForFontPreview = getNameHexForFontPreview(routeProfile);

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

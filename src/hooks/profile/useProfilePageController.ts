import { useMemo } from "react";
import { Profile as P, useProfile } from "../../contexts/ProfileContext";
import { useAuth } from "../../contexts/AuthContext";
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
} from "./profilePageController.helpers";
import { useProfilePageMutations } from "./useProfilePageMutations";
import { useProfilePageUiState } from "./useProfilePageUiState";
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

  const {
    boards,
    boardsLoading,
    localError,
    setLocalError,
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
    promoteOpen,
    setPromoteOpen,
    banOpen,
    setBanOpen,
    promoteDraft,
    setPromoteDraft,
    banCheck,
    setBanCheck,
  } = useProfilePageUiState({
    routeProfile,
    usernameParam,
  });

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
    const meta = COLOR_TARGETS.find((target) => target.key === colorTarget)!;
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

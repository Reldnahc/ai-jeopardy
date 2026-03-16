import type { Dispatch, MutableRefObject, SetStateAction } from "react";
import type { Profile as P } from "../../contexts/ProfileContext";
import { normalizeUsername, toErrorMessage, type CustomPatch, type ModerationPatch } from "./profilePageController.shared";
import {
  requestModeratedProfileUpdate,
  requestProfileCustomizationUpdate,
} from "./profilePageController.requests";

type SetRouteProfile = Dispatch<SetStateAction<P | null>>;

type UseProfilePageMutationsArgs = {
  token: string | null | undefined;
  usernameParam: string | undefined;
  routeProfile: P | null;
  applyOverlay: (profile: P) => P | null;
  addOverlay: (patch: Partial<P>) => void;
  clearOverlay: () => void;
  maybeClearOverlayIfServerMatches: (serverProfile: P, patch: Partial<P>) => void;
  pendingOverlayRef: MutableRefObject<Partial<P>>;
  pendingSinceRef: MutableRefObject<number>;
  setRouteProfile: SetRouteProfile;
  setLocalError: Dispatch<SetStateAction<string | null>>;
  applyProfilePatch: (patch: Partial<P>) => void;
  patchProfileByUsername: (username: string, patch: Partial<P>) => void;
  refetchProfile: () => Promise<void>;
  fetchPublicProfile: (username: string) => Promise<P | null>;
};

function applyOptimisticPatch(args: {
  patch: Partial<P>;
  routeProfile: P | null;
  applyOverlay: (profile: P) => P | null;
  addOverlay: (patch: Partial<P>) => void;
  setRouteProfile: SetRouteProfile;
  applyProfilePatch: (patch: Partial<P>) => void;
  patchProfileByUsername: (username: string, patch: Partial<P>) => void;
  fallbackUsername?: string | null;
}) {
  const {
    patch,
    routeProfile,
    applyOverlay,
    addOverlay,
    setRouteProfile,
    applyProfilePatch,
    patchProfileByUsername,
    fallbackUsername,
  } = args;

  addOverlay(patch);
  setRouteProfile((prev) => (prev ? applyOverlay({ ...prev, ...patch }) : prev));
  applyProfilePatch(patch);

  const targetUsername = routeProfile?.username ?? fallbackUsername ?? null;
  if (targetUsername) patchProfileByUsername(targetUsername, patch);
}

function reconcileServerProfile(args: {
  serverProfile: P;
  patch: Partial<P>;
  applyOverlay: (profile: P) => P | null;
  maybeClearOverlayIfServerMatches?: (serverProfile: P, patch: Partial<P>) => void;
  pendingOverlayRef?: MutableRefObject<Partial<P>>;
  pendingSinceRef?: MutableRefObject<number>;
  clearOverlay?: () => void;
  setRouteProfile: SetRouteProfile;
  applyProfilePatch: (patch: Partial<P>) => void;
  patchProfileByUsername: (username: string, patch: Partial<P>) => void;
}) {
  const {
    serverProfile,
    patch,
    applyOverlay,
    maybeClearOverlayIfServerMatches,
    pendingOverlayRef,
    pendingSinceRef,
    clearOverlay,
    setRouteProfile,
    applyProfilePatch,
    patchProfileByUsername,
  } = args;

  maybeClearOverlayIfServerMatches?.(serverProfile, patch);
  const merged = applyOverlay(serverProfile)!;

  applyProfilePatch(merged);
  patchProfileByUsername(serverProfile.username, merged);
  setRouteProfile((prev) => (prev ? { ...prev, ...merged } : merged));

  if (
    clearOverlay &&
    pendingOverlayRef &&
    pendingSinceRef &&
    Object.keys(pendingOverlayRef.current).length > 0 &&
    Date.now() - pendingSinceRef.current > 3000
  ) {
    clearOverlay();
  }
}

async function recoverCustomizationFailure(args: {
  error: unknown;
  usernameParam: string | undefined;
  setLocalError: Dispatch<SetStateAction<string | null>>;
  clearOverlay: () => void;
  refetchProfile: () => Promise<void>;
  fetchPublicProfile: (username: string) => Promise<P | null>;
  setRouteProfile: SetRouteProfile;
}) {
  const {
    error,
    usernameParam,
    setLocalError,
    clearOverlay,
    refetchProfile,
    fetchPublicProfile,
    setRouteProfile,
  } = args;

  setLocalError(toErrorMessage(error));
  clearOverlay();
  await refetchProfile();

  try {
    const username = normalizeUsername(usernameParam);
    if (username) {
      const profile = await fetchPublicProfile(username);
      setRouteProfile(profile);
    }
  } catch {
    // ignore
  }
}

export function useProfilePageMutations(args: UseProfilePageMutationsArgs) {
  const {
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
  } = args;

  const saveCustomization = async (patch: CustomPatch) => {
    if (!token) return;

    applyOptimisticPatch({
      patch,
      routeProfile,
      applyOverlay,
      addOverlay,
      setRouteProfile,
      applyProfilePatch,
      patchProfileByUsername,
    });

    try {
      const data = await requestProfileCustomizationUpdate(token, patch);
      if (data.profile) {
        reconcileServerProfile({
          serverProfile: data.profile,
          patch,
          applyOverlay,
          maybeClearOverlayIfServerMatches,
          pendingOverlayRef,
          pendingSinceRef,
          clearOverlay,
          setRouteProfile,
          applyProfilePatch,
          patchProfileByUsername,
        });
      }
    } catch (error: unknown) {
      await recoverCustomizationFailure({
        error,
        usernameParam,
        setLocalError,
        clearOverlay,
        refetchProfile,
        fetchPublicProfile,
        setRouteProfile,
      });
    }
  };

  const patchAnyProfile = async (targetUsername: string, patch: ModerationPatch) => {
    if (!token) return;

    applyOptimisticPatch({
      patch,
      routeProfile,
      applyOverlay,
      addOverlay,
      setRouteProfile,
      applyProfilePatch,
      patchProfileByUsername,
      fallbackUsername: targetUsername,
    });

    try {
      const data = await requestModeratedProfileUpdate(token, targetUsername, patch);
      if (data.profile) {
        reconcileServerProfile({
          serverProfile: data.profile,
          patch,
          applyOverlay,
          setRouteProfile,
          applyProfilePatch,
          patchProfileByUsername,
        });
      }
    } catch (error: unknown) {
      setLocalError(toErrorMessage(error));
      clearOverlay();
      await refetchProfile();
    }
  };

  return { saveCustomization, patchAnyProfile };
}

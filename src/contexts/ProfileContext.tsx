import { createContext, useContext, useMemo, type ReactNode } from "react";
import { useAuth } from "./AuthContext";
import { useProfileContextBootstrap } from "./profileContext.bootstrap.ts";
import { useProfileContextStore } from "./profileContext.store.ts";
import type {
  Profile,
  ProfileContextType,
  ProfileCustomization,
  ProfileStats,
} from "./profileContext.types.ts";

const ProfileContext = createContext<ProfileContextType>({
  profile: null,
  loading: true,
  error: null,
  getProfileByUsername: () => null,
  fetchPublicProfile: async () => null,
  fetchMeProfile: async () => null,
  applyProfilePatch: () => {},
  patchProfileByUsername: () => {},
  fetchPublicProfiles: async () => {},
  refetchProfile: async () => {},
  setProfileExplicit: () => {},
});

export function ProfileProvider({ children }: { children: ReactNode }) {
  const { token, user, loading: authLoading } = useAuth();
  const store = useProfileContextStore({ token });

  useProfileContextBootstrap({
    authLoading,
    token,
    username: user?.username,
    getProfileByUsername: store.getProfileByUsername,
    fetchMeProfile: store.fetchMeProfile,
    refetchProfile: store.refetchProfile,
    setProfileExplicit: store.setProfileExplicit,
    setProfileLoading: store.setProfileLoading,
    setError: store.setError,
  });

  const ctxValue = useMemo<ProfileContextType>(
    () => ({
      profile: store.profile,
      loading: store.profileLoading,
      error: store.error,
      getProfileByUsername: store.getProfileByUsername,
      fetchPublicProfile: store.fetchPublicProfile,
      fetchPublicProfiles: store.fetchPublicProfiles,
      fetchMeProfile: store.fetchMeProfile,
      applyProfilePatch: store.applyProfilePatch,
      patchProfileByUsername: store.patchProfileByUsername,
      refetchProfile: store.refetchProfile,
      setProfileExplicit: store.setProfileExplicit,
    }),
    [
      store.profile,
      store.profileLoading,
      store.error,
      store.getProfileByUsername,
      store.fetchPublicProfile,
      store.fetchPublicProfiles,
      store.fetchMeProfile,
      store.applyProfilePatch,
      store.patchProfileByUsername,
      store.refetchProfile,
      store.setProfileExplicit,
    ],
  );

  return <ProfileContext.Provider value={ctxValue}>{children}</ProfileContext.Provider>;
}

export const useProfile = () => useContext(ProfileContext);

export type { Profile, ProfileContextType, ProfileCustomization, ProfileStats };

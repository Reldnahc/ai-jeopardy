import { useEffect } from "react";
import type { Profile } from "./profileContext.types.ts";

type UseProfileContextBootstrapArgs = {
  authLoading: boolean;
  token: string | null | undefined;
  username: string | null | undefined;
  getProfileByUsername: (username: string | null | undefined) => Profile | null;
  fetchMeProfile: () => Promise<Profile | null>;
  refetchProfile: () => Promise<void>;
  setProfileExplicit: (profile: Profile | null) => void;
  setProfileLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
};

export function useProfileContextBootstrap(args: UseProfileContextBootstrapArgs) {
  const {
    authLoading,
    token,
    username,
    getProfileByUsername,
    fetchMeProfile,
    refetchProfile,
    setProfileExplicit,
    setProfileLoading,
    setError,
  } = args;

  useEffect(() => {
    if (authLoading) return;

    if (!token) {
      setProfileExplicit(null);
      setProfileLoading(false);
      setError(null);
      return;
    }

    void refetchProfile();
  }, [authLoading, token, refetchProfile, setError, setProfileExplicit, setProfileLoading]);

  useEffect(() => {
    if (authLoading) return;
    if (!token || !username) return;

    const cached = getProfileByUsername(username);
    if (cached) return;

    void fetchMeProfile().catch(() => {});
  }, [authLoading, token, username, getProfileByUsername, fetchMeProfile]);
}

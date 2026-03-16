import { useCallback, useRef, useState } from "react";
import type { Profile } from "./profileContext.types.ts";
import {
  getErrorMessage,
  getMissingProfileUsernames,
  isFreshCacheEntry,
  mergeDefined,
  normalizeUsername,
  patchCachedProfile,
  PROFILE_TTL_MS,
  readCachedProfile,
  upsertCachedProfile,
  type ProfilesByUsername,
} from "./profileContext.helpers.ts";
import {
  requestMeProfile,
  requestPublicProfile,
  requestPublicProfiles,
} from "./profileContext.requests.ts";

type ProfilesByUsernameState = ProfilesByUsername<Profile>;

type UseProfileContextStoreArgs = {
  token: string | null | undefined;
};

export function useProfileContextStore({ token }: UseProfileContextStoreArgs) {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [profilesByUsername, setProfilesByUsername] = useState<ProfilesByUsernameState>({});
  const [profileLoading, setProfileLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const meSeq = useRef(0);
  const inFlightPublic = useRef(new Set<string>());

  const cacheUpsert = useCallback((nextProfile: Profile) => {
    setProfilesByUsername((prev) => upsertCachedProfile(prev, nextProfile));
  }, []);

  const getProfileByUsername = useCallback(
    (usernameRaw: string | null | undefined): Profile | null => {
      return readCachedProfile(profilesByUsername, usernameRaw);
    },
    [profilesByUsername],
  );

  const fetchPublicProfile = useCallback(
    async (usernameRaw: string): Promise<Profile | null> => {
      const username = normalizeUsername(usernameRaw);
      if (!username) return null;

      const entry = profilesByUsername[username];
      if (isFreshCacheEntry(entry, Date.now(), PROFILE_TTL_MS)) return entry.profile;

      if (inFlightPublic.current.has(username)) return null;
      inFlightPublic.current.add(username);

      try {
        const nextProfile = await requestPublicProfile<Profile>(username);
        if (nextProfile) cacheUpsert(nextProfile);
        return nextProfile ?? null;
      } finally {
        inFlightPublic.current.delete(username);
      }
    },
    [cacheUpsert, profilesByUsername],
  );

  const fetchPublicProfiles = useCallback(
    async (usernamesRaw: string[]): Promise<void> => {
      const usernames = (usernamesRaw ?? []).map(normalizeUsername).filter(Boolean);
      if (usernames.length === 0) return;

      const missing = getMissingProfileUsernames(usernames, profilesByUsername);
      if (missing.length === 0) return;

      for (const username of missing) inFlightPublic.current.add(username);

      try {
        const nextProfiles = await requestPublicProfiles<Profile>(missing);
        for (const nextProfile of nextProfiles) {
          if (nextProfile) cacheUpsert(nextProfile);
        }
      } finally {
        for (const username of missing) inFlightPublic.current.delete(username);
      }
    },
    [profilesByUsername, cacheUpsert],
  );

  const fetchMeProfile = useCallback(async (): Promise<Profile | null> => {
    if (!token) return null;

    const requestId = ++meSeq.current;
    const nextProfile = await requestMeProfile<Profile>(token);
    if (nextProfile) {
      cacheUpsert(nextProfile);
      if (requestId === meSeq.current) {
        setProfile(nextProfile);
      }
    }

    return nextProfile ?? null;
  }, [token, cacheUpsert]);

  const applyProfilePatch = useCallback(
    (patch: Partial<Profile>) => {
      setProfile((prev) => {
        if (!prev) return prev;
        if (patch.id && patch.id !== prev.id) return prev;

        const optimistic = { ...patch } as Partial<Profile>;
        const nextProfile = mergeDefined(prev, optimistic);
        cacheUpsert(nextProfile);
        return nextProfile;
      });
    },
    [cacheUpsert],
  );

  const patchProfileByUsername = useCallback((usernameRaw: string, patch: Partial<Profile>) => {
    const username = normalizeUsername(usernameRaw);
    if (!username) return;

    const optimistic = { ...patch } as Partial<Profile>;

    setProfilesByUsername((prev) => patchCachedProfile(prev, username, optimistic));
    setProfile((prev) => {
      if (!prev) return prev;
      if (normalizeUsername(prev.username) !== username) return prev;
      return mergeDefined(prev, optimistic);
    });
  }, []);

  const refetchProfile = useCallback(async () => {
    setError(null);
    setProfileLoading(true);

    try {
      if (!token) {
        setProfile(null);
        return;
      }

      await fetchMeProfile();
    } catch (nextError: unknown) {
      setError(getErrorMessage(nextError));
      setProfile(null);
    } finally {
      setProfileLoading(false);
    }
  }, [token, fetchMeProfile]);

  return {
    profile,
    profilesByUsername,
    profileLoading,
    error,
    setError,
    setProfileLoading,
    getProfileByUsername,
    fetchPublicProfile,
    fetchPublicProfiles,
    fetchMeProfile,
    applyProfilePatch,
    patchProfileByUsername,
    refetchProfile,
    setProfileExplicit: setProfile,
  };
}

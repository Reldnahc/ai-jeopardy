export type CachedProfileRecord<T> = {
  profile: T;
  cachedAt: number;
};

export type ProfilesByUsername<T> = Record<string, CachedProfileRecord<T>>;

export const PROFILE_TTL_MS = 60_000;

export function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}

export function getApiBase(): string {
  if (import.meta.env.DEV) return import.meta.env.VITE_API_BASE || "http://localhost:3002";
  return "";
}

export function normalizeUsername(value: unknown): string {
  return String(value ?? "")
    .trim()
    .toLowerCase();
}

export function mergeDefined<T extends object>(prev: T, patch: Partial<T>): T {
  const next: T = { ...prev };
  (Object.keys(patch) as Array<keyof T>).forEach((key) => {
    const value = patch[key];
    if (value !== undefined) {
      next[key] = value;
    }
  });
  return next;
}

export async function safeJson(res: Response): Promise<unknown> {
  try {
    return await res.json();
  } catch {
    return null;
  }
}

export function isFreshCacheEntry<T>(
  entry: CachedProfileRecord<T> | undefined,
  now: number = Date.now(),
  ttlMs: number = PROFILE_TTL_MS,
): boolean {
  return Boolean(entry && now - entry.cachedAt < ttlMs);
}

export function readCachedProfile<T>(
  profilesByUsername: ProfilesByUsername<T>,
  username: string | null | undefined,
): T | null {
  const normalized = normalizeUsername(username);
  if (!normalized) return null;
  return profilesByUsername[normalized]?.profile ?? null;
}

export function upsertCachedProfile<T extends { username?: string | null }>(
  profilesByUsername: ProfilesByUsername<T>,
  profile: T,
  now: number = Date.now(),
): ProfilesByUsername<T> {
  const username = normalizeUsername(profile.username);
  if (!username) return profilesByUsername;

  const existing = profilesByUsername[username];
  if (!existing) {
    return { ...profilesByUsername, [username]: { profile, cachedAt: now } };
  }

  return {
    ...profilesByUsername,
    [username]: {
      profile: mergeDefined(existing.profile, profile),
      cachedAt: now,
    },
  };
}

export function getMissingProfileUsernames<T>(
  usernamesRaw: string[],
  profilesByUsername: ProfilesByUsername<T>,
  now: number = Date.now(),
  ttlMs: number = PROFILE_TTL_MS,
): string[] {
  const usernames = (usernamesRaw ?? []).map(normalizeUsername).filter(Boolean);

  return usernames.filter((username) => !isFreshCacheEntry(profilesByUsername[username], now, ttlMs));
}

export function patchCachedProfile<T>(
  profilesByUsername: ProfilesByUsername<T>,
  usernameRaw: string,
  patch: Partial<T>,
  now: number = Date.now(),
): ProfilesByUsername<T> {
  const username = normalizeUsername(usernameRaw);
  if (!username) return profilesByUsername;

  const existing = profilesByUsername[username];
  if (!existing) return profilesByUsername;

  return {
    ...profilesByUsername,
    [username]: {
      profile: mergeDefined(existing.profile, patch),
      cachedAt: now,
    },
  };
}

import { getApiBase, safeJson } from "./profileContext.helpers.ts";

export async function requestPublicProfile<T>(
  username: string,
  fetchImpl: typeof fetch = fetch,
): Promise<T> {
  const api = getApiBase();
  const res = await fetchImpl(`${api}/api/profile/${encodeURIComponent(username)}`, {
    cache: "no-store",
  });

  if (!res.ok) {
    const data = (await safeJson(res)) as { error?: string } | null;
    throw new Error(data?.error || "Failed to load profile");
  }

  const data = (await safeJson(res)) as { profile?: T } | null;
  if (!data) throw new Error("Failed to load profile");
  return data.profile as T;
}

export async function requestPublicProfiles<T>(
  usernames: string[],
  fetchImpl: typeof fetch = fetch,
): Promise<T[]> {
  const api = getApiBase();
  const qs = new URLSearchParams();
  for (const username of usernames.slice(0, 50)) qs.append("u", username);

  const res = await fetchImpl(`${api}/api/profile/batch?${qs.toString()}`, {
    cache: "no-store",
  });

  if (!res.ok) {
    const data = (await safeJson(res)) as { error?: string } | null;
    throw new Error(data?.error || "Failed to load profiles");
  }

  const data = (await safeJson(res)) as { profiles?: T[] } | null;
  return (data?.profiles ?? []) as T[];
}

export async function requestMeProfile<T>(
  token: string,
  fetchImpl: typeof fetch = fetch,
): Promise<T> {
  const api = getApiBase();
  const res = await fetchImpl(`${api}/api/profile/me`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  });

  if (!res.ok) {
    const data = (await safeJson(res)) as { error?: string } | null;
    throw new Error(data?.error || "Failed to load profile");
  }

  const data = (await safeJson(res)) as { profile?: T } | null;
  if (!data) throw new Error("Failed to load profile");
  return data.profile as T;
}

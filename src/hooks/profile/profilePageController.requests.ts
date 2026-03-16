import type { Profile as P } from "../../contexts/ProfileContext";
import { getApiBase, type CustomPatch, type ModerationPatch, type PatchMeResponse } from "./profilePageController.shared";

export async function requestProfileCustomizationUpdate(
  token: string,
  patch: CustomPatch,
  fetchImpl: typeof fetch = fetch,
): Promise<PatchMeResponse> {
  const api = getApiBase();
  const res = await fetchImpl(`${api}/api/profile/me`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(patch),
  });

  const data = (await res.json()) as PatchMeResponse;
  if (!res.ok) throw new Error(data?.error || "Failed to update profile");
  return data;
}

export async function requestModeratedProfileUpdate(
  token: string,
  targetUsername: string,
  patch: ModerationPatch,
  fetchImpl: typeof fetch = fetch,
): Promise<{ profile?: P; error?: string }> {
  const api = getApiBase();
  const res = await fetchImpl(`${api}/api/profile/${encodeURIComponent(targetUsername)}`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(patch),
  });

  const data = (await res.json()) as { profile?: P; error?: string };
  if (!res.ok) throw new Error(data?.error || "Failed to update profile");
  return data;
}

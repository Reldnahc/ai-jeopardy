import type { LeaderboardRow } from "../../../backend/repositories/profile/profile.types.ts";
import type { Profile } from "../../contexts/ProfileContext";
import type { ProfileIconName } from "../../components/common/profileIcons.tsx";

export function toLeaderboardProfile(r: LeaderboardRow): Profile {
  const u = String(r.username ?? "")
    .trim()
    .toLowerCase();
  const display = String(r.displayname ?? u).trim();

  return {
    id: `leaderboard:${u}`,
    username: u,
    displayname: display,
    color: r.color ?? "#3b82f6",
    text_color: r.text_color ?? "#ffffff",
    name_color: r.name_color ?? "#111827",
    border: r.border ?? "",
    font: r.font ?? null,
    icon: (r.icon as ProfileIconName) ?? null,
    role: r.role,
    email: null,
    tokens: null,
    created_at: undefined,
    updated_at: undefined,
  };
}

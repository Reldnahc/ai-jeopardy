// backend/auth/roles.ts
export const LADDER_ROLES = [
  "default",
  "moderator",
  "privileged",
  "admin",
  "head_admin",
  "creator",
] as const;

export const ALL_ROLES = [...LADDER_ROLES, "banned"] as const;

export type LadderRole = (typeof LADDER_ROLES)[number];
export type Role = LadderRole | "banned";

export function normalizeRole(raw: unknown): Role {
  const v = String(raw ?? "default").toLowerCase();
  if ((ALL_ROLES as readonly string[]).includes(v)) return v as Role;
  return "default";
}

const ROLE_RANK: Record<LadderRole, number> = {
  default: 0,
  moderator: 1,
  privileged: 2,
  admin: 3,
  head_admin: 4,
  creator: 5,
};

export function isBanned(role: Role): role is "banned" {
  return role === "banned";
}

export function rank(role: LadderRole): number {
  return ROLE_RANK[role];
}

export function atLeast(role: LadderRole, min: LadderRole): boolean {
  return rank(role) >= rank(min);
}

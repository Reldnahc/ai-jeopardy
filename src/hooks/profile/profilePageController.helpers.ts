import { LADDER_ROLES, normalizeRole, rank, type LadderRole } from "../../../shared/roles";
import type { Profile as P } from "../../contexts/ProfileContext";
import type { Board } from "../../types/Board";
import { COLOR_TARGETS, getApiBase, normalizeHex, normalizeUsername, toErrorMessage } from "./profilePageController.shared";

type RoleInfo = { label: string; className: string };

const ROLE_META: Record<LadderRole | "banned", RoleInfo> = {
  default: { label: "Player", className: "text-gray-600" },
  moderator: { label: "Moderator", className: "text-blue-600" },
  privileged: { label: "Privileged", className: "text-emerald-600" },
  admin: { label: "Admin", className: "text-red-500" },
  head_admin: { label: "Head Admin", className: "text-amber-700" },
  creator: { label: "Creator", className: "text-purple-600" },
  banned: { label: "Banned", className: "text-red-800 line-through" },
};

export function getSavedHexForTarget(profile: P, target: keyof Pick<P, "color" | "text_color" | "name_color" | "border_color" | "background_color">): string {
  const meta = COLOR_TARGETS.find((item) => item.key === target)!;
  const current = (profile[target] ?? meta.defaultHex) as string;
  return normalizeHex(current, meta.defaultHex);
}

export function buildProfileRoleState(args: {
  viewerRank: number;
  viewerRole: string;
  targetRoleRaw: unknown;
}) {
  const targetNormalizedRole = normalizeRole(args.targetRoleRaw);
  const targetRank = rank(targetNormalizedRole === "banned" ? "default" : targetNormalizedRole);
  const canTouchTarget = args.viewerRank > targetRank;
  const canModerate = args.viewerRank >= rank("moderator") && canTouchTarget;
  const canPromote = args.viewerRank >= rank("privileged") && canTouchTarget;
  const canBan = args.viewerRank >= rank("moderator") && canTouchTarget;

  const viewerIsCreator = args.viewerRole === "creator";
  const promotableRoles: LadderRole[] = viewerIsCreator
    ? [...LADDER_ROLES]
    : (LADDER_ROLES.filter((role) => rank(role) < args.viewerRank) as LadderRole[]);
  const promotableRolesFiltered = promotableRoles.filter((role) => role !== targetNormalizedRole);

  return {
    canModerate,
    canPromote,
    canBan,
    canShowPromote: canPromote && promotableRolesFiltered.length > 0,
    promotableRolesFiltered,
    roleInfo: ROLE_META[targetNormalizedRole],
  };
}

export async function loadProfileBoards(
  usernameParam: string | undefined,
  fetchImpl: typeof fetch = fetch,
): Promise<{ boards: Board[]; error: string | null }> {
  const username = normalizeUsername(usernameParam);
  if (!username) {
    return { boards: [], error: "Missing username" };
  }

  try {
    const api = getApiBase();
    const res = await fetchImpl(`${api}/api/profile/${encodeURIComponent(username)}/boards?limit=5`);
    const data = await res.json();
    if (!res.ok) throw new Error(data?.error || "Failed to load boards");
    return { boards: (data.boards ?? []) as Board[], error: null };
  } catch (error: unknown) {
    return { boards: [], error: toErrorMessage(error) };
  }
}

export function getNameHexForFontPreview(profile: P | null): string {
  const nameColorMeta = COLOR_TARGETS.find((target) => target.key === "name_color")!;
  return normalizeHex(
    String(profile?.name_color ?? nameColorMeta.defaultHex),
    nameColorMeta.defaultHex,
  );
}

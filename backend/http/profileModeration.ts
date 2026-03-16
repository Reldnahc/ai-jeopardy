import type { Repos } from "../repositories/index.js";
import { containsProfanity } from "../services/profanityService.js";
import { isBanned, normalizeRole, rank, type LadderRole } from "../../shared/roles.js";
import { asTrimmedString } from "./profileRouteHelpers.js";

type ProfileModerationRepos = Pick<Repos, "profiles">;

type ModerationFailure = {
  ok: false;
  status: number;
  error: string;
};

type ModerationAccess = {
  ok: true;
  targetUserId: string;
  actorRank: number;
};

type ModerationResult =
  | ModerationFailure
  | {
      ok: true;
      changed: boolean;
    };

export async function resolveProfileModerationAccess({
  repos,
  actorId,
  username,
}: {
  repos: ProfileModerationRepos;
  actorId: string;
  username: string;
}): Promise<ModerationFailure | ModerationAccess> {
  const targetProfile = await repos.profiles.getPublicProfileByUsername(username);
  if (!targetProfile) return { ok: false, status: 404, error: "Target not found" };

  const targetUserId = String(targetProfile.id ?? "");
  if (!targetUserId) return { ok: false, status: 500, error: "Target missing id" };

  const actorRoleRaw = await repos.profiles.getRoleById(actorId);
  const targetRoleRaw = await repos.profiles.getRoleById(targetUserId);

  if (!actorRoleRaw) return { ok: false, status: 403, error: "Unauthorized" };
  if (!targetRoleRaw) return { ok: false, status: 404, error: "Target not found" };

  const actorRole = normalizeRole(actorRoleRaw);
  const targetRole = normalizeRole(targetRoleRaw);

  if (isBanned(actorRole)) return { ok: false, status: 403, error: "Banned" };

  const actorRank = rank(actorRole as LadderRole);
  const targetEffectiveRank = targetRole === "banned" ? -1 : rank(targetRole as LadderRole);
  if (targetEffectiveRank >= actorRank) {
    return { ok: false, status: 403, error: "Cannot modify peer/superior" };
  }

  return { ok: true, targetUserId, actorRank };
}

export async function applyProfileModerationPatch({
  repos,
  targetUserId,
  actorRank,
  body,
}: {
  repos: ProfileModerationRepos;
  targetUserId: string;
  actorRank: number;
  body: Record<string, unknown>;
}): Promise<ModerationResult> {
  let changed = false;

  if ("bio" in body) {
    if (actorRank < rank("moderator")) {
      return { ok: false, status: 403, error: "Forbidden" };
    }

    const nextBio = asTrimmedString(body.bio);
    if (nextBio.length > 0 && containsProfanity(nextBio)) {
      return { ok: false, status: 400, error: "Bio contains prohibited language." };
    }

    await repos.profiles.updateCustomization(targetUserId, { bio: nextBio });
    changed = true;
  }

  if ("role" in body) {
    const newRole = normalizeRole(body.role);

    if (newRole === "banned") {
      if (actorRank < rank("moderator")) {
        return { ok: false, status: 403, error: "Forbidden" };
      }

      await repos.profiles.setRoleById(targetUserId, "banned");
      changed = true;
    } else {
      if (actorRank < rank("privileged")) {
        return { ok: false, status: 403, error: "Forbidden" };
      }

      const newLadderRole = newRole as LadderRole;
      if (rank(newLadderRole) >= actorRank) {
        return { ok: false, status: 403, error: "Cannot grant peer/superior role" };
      }

      await repos.profiles.setRoleById(targetUserId, newLadderRole);
      changed = true;
    }
  }

  return { ok: true, changed };
}

// backend/http/profileRoutes.ts
import type { Application, Request, Response } from "express";
import { requireAuth } from "./requireAuth.js";
import type { Repos } from "../repositories/index.js";
import type { CustomizationPatch } from "../repositories/profile/profile.types.js";
import {containsProfanity} from "../services/profanityService.js";
import { normalizeRole, isBanned, rank, type LadderRole } from "../../shared/roles.js";

type ProfileRepos = Pick<Repos, "profiles" | "boards">;

function normalizeUsername(u: unknown): string {
  return String(u ?? "").trim().toLowerCase();
}

function asRecord(v: unknown): Record<string, unknown> {
  return typeof v === "object" && v !== null ? (v as Record<string, unknown>) : {};
}

function asTrimmedString(v: unknown): string {
  return String(v ?? "").trim();
}

export function registerProfileRoutes(app: Application, repos: ProfileRepos) {
  // --- Me ------------------------------------------------------------

  app.get("/api/profile/me", requireAuth, async (req: Request, res: Response) => {
    const userId = req.user?.sub ?? req.user?.id ?? req.user?.userId;
    if (!userId) return res.status(401).json({ error: "Unauthorized" });

    try {
      const profile = await repos.profiles.getMeProfile(String(userId));
      if (!profile) return res.status(404).json({ error: "Not found" });
      return res.json({ profile });
    } catch (e) {
      console.error("GET /api/profile/me failed:", e);
      return res.status(500).json({ error: "Failed to load profile" });
    }
  });

  // --- Search --------------------------------------------------------

  app.get("/api/profile/search", async (req: Request, res: Response) => {
    try {
      const query = req.query as Record<string, unknown>;
      const q = String(query.q ?? "").trim();
      if (!q) return res.json({ users: [] });

      const limitRaw = Number(query.limit ?? 5);
      const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(limitRaw, 1), 20) : 5;

      const users = await repos.profiles.searchProfiles(q, limit);
      return res.json({ users });
    } catch (e) {
      console.error("GET /api/profile/search failed:", e);
      return res.status(500).json({ error: "Failed to search profiles" });
    }
  });

  // --- User boards ---------------------------------------------------

  app.get("/api/profile/:username/boards", async (req: Request, res: Response) => {
    try {
      const username = normalizeUsername(req.params.username);
      if (!username) return res.status(400).json({ error: "Missing username" });

      const query = req.query as Record<string, unknown>;

      const limitRaw = Number(query.limit ?? 10);
      const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(limitRaw, 1), 50) : 10;

      const offsetRaw = Number(query.offset ?? 0);
      const offset = Number.isFinite(offsetRaw) ? Math.max(offsetRaw, 0) : 0;

      const boards = await repos.boards.listBoardsByUsername(username, limit, offset);
      return res.json({ boards });
    } catch (e) {
      console.error("GET /api/profile/:username/boards failed:", e);
      return res.status(500).json({ error: "Failed to load boards" });
    }
  });

  // --- Update cosmetics ---------------------------------------------

  app.patch("/api/profile/me", requireAuth, async (req: Request, res: Response) => {
    try {
      const userIdRaw = req.user?.sub ?? req.user?.id ?? req.user?.userId;
      if (!userIdRaw) return res.status(401).json({ error: "Unauthorized" });

      const userId = String(userIdRaw);
      const body = asRecord(req.body);

      const patch: CustomizationPatch = {};

      if ("bio" in body) {
        patch.bio = body.bio === null ? null : asTrimmedString(body.bio);

        if (typeof patch.bio === "string" && patch.bio.length > 0) {
          if (containsProfanity(patch.bio)) {
            return res.status(400).json({ error: "Bio contains prohibited language." });
          }
        }
      }
      if ("font" in body) patch.font = body.font === null ? null : asTrimmedString(body.font);
      if ("icon" in body) patch.icon = body.icon === null ? null : asTrimmedString(body.icon);

      if ("color" in body && body.color !== undefined) patch.color = asTrimmedString(body.color);
      if ("text_color" in body && body.text_color !== undefined) patch.text_color = asTrimmedString(body.text_color);

      // NEW:
      if ("name_color" in body && body.name_color !== undefined) patch.name_color = asTrimmedString(body.name_color);
      if ("border" in body && body.border !== undefined) patch.border = asTrimmedString(body.border);

      const profile = await repos.profiles.updateCustomization(userId, patch);
      if (!profile) return res.status(400).json({ error: "No supported fields to update" });

      return res.json({ profile });
    } catch (e) {
      console.error("PATCH /api/profile/me failed:", e);
      return res.status(500).json({ error: "Failed to update profile" });
    }
  });

  app.get("/api/profile/batch", async (req: Request, res: Response) => {
    try {
      const query = req.query as Record<string, unknown>;

      // Accept either:
      // /api/profile/batch?u=alice&u=bob
      // /api/profile/batch?u=alice,bob
      const raw = query.u;

      const list =
          Array.isArray(raw) ? raw :
              typeof raw === "string" ? raw.split(",") :
                  [];

      const usernames = list
          .map(normalizeUsername)
          .filter(Boolean)
          .slice(0, 50); // safety cap

      if (usernames.length === 0) return res.json({ profiles: [] });

      // You need a repo method for this (recommended).
      // If you don't have it yet, add it to profileRepository.
      const profiles = await repos.profiles.getPublicProfilesByUsernames(usernames);

      return res.json({ profiles: profiles ?? [] });
    } catch (e) {
      console.error("GET /api/profile/batch failed:", e);
      return res.status(500).json({ error: "Failed to load profiles" });
    }
  });

  // --- Public profile ------------------------------------------------

  app.get("/api/profile/:username", async (req: Request, res: Response) => {
    try {
      const username = normalizeUsername(req.params.username);
      if (!username) return res.status(400).json({ error: "Missing username" });

      const profile = await repos.profiles.getPublicProfileByUsername(username);
      if (!profile) return res.status(404).json({ error: "Not found" });

      return res.json({ profile });
    } catch (e) {
      console.error("GET /api/profile/:username failed:", e);
      return res.status(500).json({ error: "Failed to load profile" });
    }
  });

  // --- Admin/Mod patch another user's profile ------------------------
  // Supports:
  //   - bio: moderators+ (can set to "" to delete)
  //   - role: privileged+ (ladder roles), moderators+ (banned)
  app.patch("/api/profile/:username", requireAuth, async (req: Request, res: Response) => {
    try {
      const actorIdRaw = req.user?.sub ?? req.user?.id ?? req.user?.userId;
      if (!actorIdRaw) return res.status(401).json({ error: "Unauthorized" });
      const actorId = String(actorIdRaw);

      const username = normalizeUsername(req.params.username);
      if (!username) return res.status(400).json({ error: "Missing username" });

      const body = asRecord(req.body);

      // Find target
      const targetProfile = await repos.profiles.getPublicProfileByUsername(username);
      if (!targetProfile) return res.status(404).json({ error: "Target not found" });

      const targetUserId = String(targetProfile.id ?? "");
      if (!targetUserId) return res.status(500).json({ error: "Target missing id" });

      // DB roles are authoritative
      const actorRoleRaw = await repos.profiles.getRoleById(actorId);
      const targetRoleRaw = await repos.profiles.getRoleById(targetUserId);

      if (!actorRoleRaw) return res.status(403).json({ error: "Unauthorized" });
      if (!targetRoleRaw) return res.status(404).json({ error: "Target not found" });

      const actorRole = normalizeRole(actorRoleRaw);
      const targetRole = normalizeRole(targetRoleRaw);

      if (isBanned(actorRole)) return res.status(403).json({ error: "Banned" });

      const actorRank = rank(actorRole as LadderRole);
      const targetEffectiveRank = targetRole === "banned" ? -1 : rank(targetRole as LadderRole);

      // must be strictly higher than target to touch them
      if (targetEffectiveRank >= actorRank) {
        return res.status(403).json({ error: "Cannot modify peer/superior" });
      }

      let changed = false;

      // --- Bio moderation (mods+) ---
      if ("bio" in body) {
        if (actorRank < rank("moderator")) {
          return res.status(403).json({ error: "Forbidden" });
        }

        const nextBio = asTrimmedString(body.bio);

        // If non-empty, enforce profanity rule (optional but consistent)
        if (nextBio.length > 0 && containsProfanity(nextBio)) {
          return res.status(400).json({ error: "Bio contains prohibited language." });
        }

        // Set bio. Your "delete bio" uses "".
        await repos.profiles.updateCustomization(targetUserId, { bio: nextBio });
        changed = true;
      }

      // --- Role changes ---
      if ("role" in body) {
        const newRole = normalizeRole(body.role);

        // Ban: moderators+
        if (newRole === "banned") {
          if (actorRank < rank("moderator")) {
            return res.status(403).json({ error: "Forbidden" });
          }

          // already checked peer/superior above
          await repos.profiles.setRoleById(targetUserId, "banned");
          changed = true;
        } else {
          // Ladder role change: privileged+
          if (actorRank < rank("privileged")) {
            return res.status(403).json({ error: "Forbidden" });
          }

          const newLadderRole = newRole as LadderRole;

          // Can't grant peer/superior role
          if (rank(newLadderRole) >= actorRank) {
            return res.status(403).json({ error: "Cannot grant peer/superior role" });
          }

          // This allows BOTH promote and demote:
          // any role below actor is valid, regardless of target's current role.
          await repos.profiles.setRoleById(targetUserId, newLadderRole);
          changed = true;
        }
      }

      if (!changed) {
        return res.status(400).json({ error: "No supported fields to update" });
      }

      // Return refreshed public profile
      const updated = await repos.profiles.getPublicProfileByUsername(username);
      return res.json({ profile: updated });
    } catch (e) {
      console.error("PATCH /api/profile/:username failed:", e);
      return res.status(500).json({ error: "Failed to update profile" });
    }
  });

}

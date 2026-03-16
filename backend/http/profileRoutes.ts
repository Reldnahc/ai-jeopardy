// backend/http/profileRoutes.ts
import type { Application, Request, Response } from "express";
import { requireAuth } from "./requireAuth.js";
import {
  asRecord,
  asTrimmedString,
  getAuthedUserId,
  normalizeUsername,
  parseBatchUsernames,
  parseBoardsLimit,
  parseBoardsOffset,
  parseSearchLimit,
} from "./profileRouteHelpers.js";
import type { Repos } from "../repositories/index.js";
import type { CustomizationPatch } from "../repositories/profile/profile.types.js";
import { containsProfanity } from "../services/profanityService.js";
import { resolveProfileModerationAccess, applyProfileModerationPatch } from "./profileModeration.js";

type ProfileRepos = Pick<Repos, "profiles" | "boards">;

export {
  asRecord,
  asTrimmedString,
  clampFiniteNumber,
  getAuthedUserId,
  normalizeUsername,
  parseBatchUsernames,
  parseBoardsLimit,
  parseBoardsOffset,
  parseSearchLimit,
} from "./profileRouteHelpers.js";

export function registerProfileRoutes(app: Application, repos: ProfileRepos) {
  // --- Me ------------------------------------------------------------

  app.get("/api/profile/me", requireAuth, async (req: Request, res: Response) => {
    const userId = getAuthedUserId(req);
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

      const limit = parseSearchLimit(query.limit);

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

      const limit = parseBoardsLimit(query.limit);
      const offset = parseBoardsOffset(query.offset);

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
      const userId = getAuthedUserId(req);
      if (!userId) return res.status(401).json({ error: "Unauthorized" });
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
      if ("text_color" in body && body.text_color !== undefined)
        patch.text_color = asTrimmedString(body.text_color);

      if ("name_color" in body && body.name_color !== undefined)
        patch.name_color = asTrimmedString(body.name_color);

      if ("border" in body && body.border !== undefined)
        patch.border = asTrimmedString(body.border);
      if ("border_color" in body && body.border_color !== undefined)
        patch.border_color = asTrimmedString(body.border_color);

      if ("background" in body && body.background !== undefined)
        patch.background = asTrimmedString(body.background);
      if ("background_color" in body && body.background_color !== undefined)
        patch.background_color = asTrimmedString(body.background_color);

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
      const usernames = parseBatchUsernames(query.u);

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
      const actorId = getAuthedUserId(req);
      if (!actorId) return res.status(401).json({ error: "Unauthorized" });

      const username = normalizeUsername(req.params.username);
      if (!username) return res.status(400).json({ error: "Missing username" });

      const body = asRecord(req.body);
      const access = await resolveProfileModerationAccess({ repos, actorId, username });
      if (!access.ok) return res.status(access.status).json({ error: access.error });

      const result = await applyProfileModerationPatch({
        repos,
        targetUserId: access.targetUserId,
        actorRank: access.actorRank,
        body,
      });
      if (!result.ok) return res.status(result.status).json({ error: result.error });

      if (!result.changed) {
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

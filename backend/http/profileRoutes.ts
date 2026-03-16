// backend/http/profileRoutes.ts
import type { Application, Request, Response } from "express";
import { requireAuth } from "./requireAuth.js";
import {
  asRecord,
  getAuthedUserId,
  normalizeUsername,
  parseBatchUsernames,
  parseBoardsLimit,
  parseBoardsOffset,
  parseSearchLimit,
} from "./profileRouteHelpers.js";
import type { Repos } from "../repositories/index.js";
import { resolveProfileModerationAccess, applyProfileModerationPatch } from "./profileModeration.js";
import { buildProfileCustomizationPatch } from "./profileCustomization.js";

type ProfileRepos = Pick<Repos, "profiles" | "boards">;

export {
  asRecord,
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
      const result = buildProfileCustomizationPatch(body);
      if (!result.ok) return res.status(result.status).json({ error: result.error });

      const profile = await repos.profiles.updateCustomization(userId, result.patch);
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

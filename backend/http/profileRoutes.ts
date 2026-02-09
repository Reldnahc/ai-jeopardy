// backend/http/profileRoutes.ts
import type { Application, Request, Response } from "express";
import { requireAuth } from "./requireAuth.js";
import {Repos} from "../repositories/index.js";


type ProfileRepos = Pick<Repos, "profiles" | "boards">;


function normalizeUsername(u: unknown): string {
  return String(u || "").trim().toLowerCase();
}

function asRecord(v: unknown): Record<string, unknown> {
  return typeof v === "object" && v !== null ? (v as Record<string, unknown>) : {};
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
      const limit = Number.isFinite(limitRaw)
          ? Math.min(Math.max(limitRaw, 1), 20)
          : 5;

      const users = await repos.profiles.searchProfiles(q, limit);
      return res.json({ users });
    } catch (e) {

      console.error("GET /api/profile/search failed:", e);
      return res.status(500).json({ error: "Failed to search profiles" });
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

  // --- User boards ---------------------------------------------------

  app.get("/api/profile/:username/boards", async (req: Request, res: Response) => {
    try {
      const username = normalizeUsername(req.params.username);
      if (!username) {
        return res.status(400).json({ error: "Missing username" });
      }

      const query = req.query as Record<string, unknown>;

      const limitRaw = Number(query.limit ?? 10);
      const limit = Number.isFinite(limitRaw)
          ? Math.min(Math.max(limitRaw, 1), 50)
          : 10;

      const offsetRaw = Number(query.offset ?? 0);
      const offset = Number.isFinite(offsetRaw)
          ? Math.max(offsetRaw, 0)
          : 0;

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
      const userIdRaw = req.user?.sub;
      if (!userIdRaw) {
        return res.status(401).json({ error: "Unauthorized" });
      }

      const userId = String(userIdRaw);
      const body = asRecord(req.body);

      const colorRaw = body.color;
      const textColorRaw = body.text_color;

      const color = colorRaw === undefined ? undefined : (colorRaw as string);
      const text_color = textColorRaw === undefined ? undefined : (textColorRaw as string);

      const profile = await repos.profiles.updateCosmetics(userId, color, text_color);


      if (!profile) return res.status(400).json({ error: "No supported fields to update" });
      return res.json({ profile });
    } catch (e) {
      console.error("PATCH /api/profile/me failed:", e);
      return res.status(500).json({ error: "Failed to update profile" });
    }
  });


}

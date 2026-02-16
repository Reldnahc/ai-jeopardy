// backend/http/leaderboardRoutes.ts
import type { Application, Request, Response } from "express";
import type { Repos } from "../repositories/index.js";

type LeaderboardRepos = Pick<Repos, "profiles">;

export function registerLeaderboardRoutes(app: Application, repos: LeaderboardRepos) {
    app.get("/api/leaderboard", async (req: Request, res: Response) => {
        try {
            const q = req.query as Record<string, unknown>;

            const stat = q.stat;
            const limit = q.limit;
            const offset = q.offset;

            const rows = await repos.profiles.listLeaderboard(stat, limit, offset);
            return res.json({ rows });
        } catch (e) {
            console.error("GET /api/leaderboard failed:", e);
            return res.status(500).json({ error: "Failed to load leaderboard" });
        }
    });
}

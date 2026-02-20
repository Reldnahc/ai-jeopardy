// backend/http/boardRoutes.ts
import type { Application, Request, Response } from "express";
import type { Repos } from "../repositories/index.js";

export type Board = Record<string, unknown>;
export type BoardRepos = Pick<Repos, "boards">;

export function registerBoardRoutes(app: Application, repos: BoardRepos) {
  app.get("/api/boards/recent", async (req: Request, res: Response) => {
    try {
      const query = req.query as Record<string, unknown>;

      const limitRaw = Number(query.limit ?? 10);
      const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(limitRaw, 1), 50) : 10;

      const offsetRaw = Number(query.offset ?? 0);
      const offset = Number.isFinite(offsetRaw) ? Math.max(offsetRaw, 0) : 0;

      const model =
        typeof query.model === "string" && query.model.trim() ? query.model.trim() : null;

      const boards = await repos.boards.listRecentBoards(limit, offset, model);

      return res.json({ boards });
    } catch (e) {
      console.error("GET /api/boards/recent failed:", e);
      return res.status(500).json({ error: "Failed to load recent boards" });
    }
  });
}

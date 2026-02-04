import { pool } from "../config/pg.js";

export function registerBoardRoutes(app) {
    // Recent boards feed (optionally filter by model)
    app.get("/api/boards/recent", async (req, res) => {
        try {
            const limitRaw = Number(req.query.limit ?? 10);
            const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(limitRaw, 1), 50) : 10;

            const offsetRaw = Number(req.query.offset ?? 0);
            const offset = Number.isFinite(offsetRaw) ? Math.max(offsetRaw, 0) : 0;

            const model = typeof req.query.model === "string" && req.query.model.trim()
                ? req.query.model.trim()
                : null;

            const { rows } = await pool.query(
                `
                select board
                from jeopardy_boards
                where ($3::text is null or board->>'model' = $3::text)
                order by created_at desc
                limit $1
                offset $2
                `,
                [limit, offset, model]
            );

            res.json({ boards: rows.map((r) => r.board) });
        } catch (e) {
            console.error("GET /api/boards/recent failed:", e);
            res.status(500).json({ error: "Failed to load recent boards" });
        }
    });
}

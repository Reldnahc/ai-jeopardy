export function registerBoardRoutes(app, repos) {
    app.get("/api/boards/recent", async (req, res) => {
        try {
            const limitRaw = Number(req.query.limit ?? 10);
            const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(limitRaw, 1), 50) : 10;

            const offsetRaw = Number(req.query.offset ?? 0);
            const offset = Number.isFinite(offsetRaw) ? Math.max(offsetRaw, 0) : 0;

            const model =
                typeof req.query.model === "string" && req.query.model.trim()
                    ? req.query.model.trim()
                    : null;

            const boards = await repos.boards.listRecentBoards(limit, offset, model );

            res.json({ boards });
        } catch (e) {
            console.error("GET /api/boards/recent failed:", e);
            res.status(500).json({ error: "Failed to load recent boards" });
        }
    });
}


import { requireAuth } from "./requireAuth.js";

function isValidHexColor(s) {
    return typeof s === "string" && /^#[0-9a-fA-F]{6}$/.test(s);
}

function normalizeUsername(u) {
    return String(u || "").trim().toLowerCase();
}

export function registerProfileRoutes(app, repos ) {
    // --- Me ------------------------------------------------------------

    app.get("/api/profile/me", requireAuth, async (req, res) => {
        const userId = req.user?.sub ?? req.user?.id ?? req.user?.userId;
        if (!userId) return res.status(401).json({ error: "Unauthorized" });

        try {
            const profile = await repos.profiles.getMeProfile(userId);
            if (!profile) return res.status(404).json({ error: "Not found" });

            res.json({ profile });
        } catch (e) {
            console.error("GET /api/profile/me failed:", e);
            res.status(500).json({ error: "Failed to load profile" });
        }
    });

    // --- Search --------------------------------------------------------

    app.get("/api/profile/search", async (req, res) => {
        try {
            const q = String(req.query.q ?? "").trim();
            if (!q) return res.json({ users: [] });

            const limitRaw = Number(req.query.limit ?? 5);
            const limit = Number.isFinite(limitRaw)
                ? Math.min(Math.max(limitRaw, 1), 20)
                : 5;

            const users = await repos.profiles.searchProfiles(q, limit);
            res.json({ users });
        } catch (e) {
            console.error("GET /api/profile/search failed:", e);
            res.status(500).json({ error: "Failed to search profiles" });
        }
    });

    // --- Public profile ------------------------------------------------

    app.get("/api/profile/:username", async (req, res) => {
        try {
            const username = normalizeUsername(req.params.username);
            if (!username) return res.status(400).json({ error: "Missing username" });

            const profile = await repos.profiles.getPublicProfileByUsername(username);
            if (!profile) return res.status(404).json({ error: "Not found" });

            res.json({ profile });
        } catch (e) {
            console.error("GET /api/profile/:username failed:", e);
            res.status(500).json({ error: "Failed to load profile" });
        }
    });

    // --- User boards ---------------------------------------------------

    app.get("/api/profile/:username/boards", async (req, res) => {
        try {
            const username = normalizeUsername(req.params.username);
            if (!username) return res.status(400).json({ error: "Missing username" });

            const limitRaw = Number(req.query.limit ?? 10);
            const limit = Number.isFinite(limitRaw)
                ? Math.min(Math.max(limitRaw, 1), 50)
                : 10;

            const offsetRaw = Number(req.query.offset ?? 0);
            const offset = Number.isFinite(offsetRaw)
                ? Math.max(offsetRaw, 0)
                : 0;

            const boards = await repos.boards.listBoardsByUsername(
                username,
                limit,
                offset,
            );

            res.json({ boards });
        } catch (e) {
            console.error("GET /api/profile/:username/boards failed:", e);
            res.status(500).json({ error: "Failed to load boards" });
        }
    });

    // --- Update cosmetics ---------------------------------------------

    app.patch("/api/profile/me", requireAuth, async (req, res) => {
        try {
            const userId = req.user?.sub ?? req.user?.id ?? req.user?.userId;
            if (!userId) return res.status(401).json({ error: "Unauthorized" });

            const color = req.body?.color;
            const text_color = req.body?.text_color;

            if (color !== undefined && !isValidHexColor(color)) {
                return res.status(400).json({ error: "Invalid color" });
            }

            if (text_color !== undefined && !isValidHexColor(text_color)) {
                return res.status(400).json({ error: "Invalid text_color" });
            }

            const profile = await repos.profiles.updateCosmetics(
                userId,
                color,
                text_color,
            );

            if (!profile) {
                return res.status(400).json({ error: "No supported fields to update" });
            }

            res.json({ profile });
        } catch (e) {
            console.error("PATCH /api/profile/me failed:", e);
            res.status(500).json({ error: "Failed to update profile" });
        }
    });
}

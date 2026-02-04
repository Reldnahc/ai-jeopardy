import { pool } from "../config/pg.js";
import { requireAuth } from "./requireAuth.js";

function isValidHexColor(s) {
    return typeof s === "string" && /^#[0-9a-fA-F]{6}$/.test(s);
}

function normalizeUsername(u) {
    return String(u || "").trim().toLowerCase();
}

export function registerProfileRoutes(app) {
    app.get("/api/profile/me", requireAuth, async (req, res) => {
        const userId = req.user?.sub ?? req.user?.id ?? req.user?.userId;

        if (!userId) {
            return res.status(401).json({ error: "Unauthorized" });
        }

        try {
            const { rows } = await pool.query(
                `select
                  id,
                  email,
                  username,
                  displayname,
                  role,
                  tokens,
                  bio,
                  color,
                  text_color,
                  games_finished,
                  games_won,
                  boards_generated,
                  money_won,
                  created_at,
                  updated_at
                from profiles
                where id = $1
                limit 1`,
                [userId]
            );

            if (!rows.length) return res.status(404).json({ error: "Not found" });
            res.json({ profile: rows[0] });
        } catch (e) {
            console.error("GET /api/profile/me failed:", e);
            res.status(500).json({ error: "Failed to load profile" });
        }
    });

    app.get("/api/profile/search", async (req, res) => {
        try {
            const q = String(req.query.q ?? "").trim();
            if (!q) return res.json({ users: [] });

            const limitRaw = Number(req.query.limit ?? 5);
            const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(limitRaw, 1), 20) : 5;

            // Avoid LIKE wildcard abuse / massive scans on tiny input
            if (q.length < 2) return res.json({ users: [] });

            const like = `%${q}%`;

            const { rows } = await pool.query(
                `select
                    username,
                    displayname,
                    color,
                    text_color
                 from profiles
                 where username ilike $1
                    or displayname ilike $1
                 order by
                    case
                      when username ilike $2 then 0
                      when username ilike $1 then 1
                      else 2
                    end,
                    username asc
                 limit $3`,
                [like, `${q}%`, limit]
            );

            res.json({ users: rows });
        } catch (e) {
            console.error("GET /api/profile/search failed:", e);
            res.status(500).json({ error: "Failed to search profiles" });
        }
    });

    app.get("/api/profile/:username", async (req, res) => {
        try {
            const username = normalizeUsername(req.params.username);
            if (!username) return res.status(400).json({ error: "Missing username" });

            const { rows } = await pool.query(
                `select
           id,
           username,
           displayname,
           bio,
           color,
           text_color,
           games_finished,
           games_won,
           boards_generated,
           money_won,
           created_at
         from profiles
         where username = $1
         limit 1`,
                [username]
            );

            if (!rows.length) return res.status(404).json({ error: "Not found" });
            res.json({ profile: rows[0] });
        } catch (e) {
            console.error("GET /api/profile/:username failed:", e);
            res.status(500).json({ error: "Failed to load profile" });
        }
    });

    app.get("/api/profile/:username/boards", async (req, res) => {
        try {
            const username = normalizeUsername(req.params.username);
            if (!username) return res.status(400).json({ error: "Missing username" });

            const limitRaw = Number(req.query.limit ?? 10);
            const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(limitRaw, 1), 50) : 10;

            const offsetRaw = Number(req.query.offset ?? 0);
            const offset = Number.isFinite(offsetRaw) ? Math.max(offsetRaw, 0) : 0;

            const { rows } = await pool.query(
                `
      select jb.board
      from jeopardy_boards jb
      join profiles p on p.id = jb.owner
      where p.username = $1
      order by jb.created_at desc
      limit $2
      offset $3
      `,
                [username, limit, offset]
            );

            res.json({ boards: rows.map((r) => r.board) });
        } catch (e) {
            console.error("GET /api/profile/:username/boards failed:", e);
            res.status(500).json({ error: "Failed to load boards" });
        }
    });

    app.patch("/api/profile/me", requireAuth, async (req, res) => {
        try {
            const userId = req.user?.sub ?? req.user?.id ?? req.user?.userId;

            if (!userId) {
                return res.status(401).json({ error: "Unauthorized" });
            }

            // TEMP DEBUG (remove once fixed)
            console.log("PATCH /api/profile/me req.user =", req.user);
            console.log("PATCH /api/profile/me userId =", userId);

            const color = req.body?.color;
            const text_color = req.body?.text_color;

            const updates = [];
            const values = [];
            let i = 1;

            if (color !== undefined) {
                if (!isValidHexColor(color)) return res.status(400).json({ error: "Invalid color" });
                updates.push(`color = $${i++}`);
                values.push(color);
            }

            if (text_color !== undefined) {
                if (!isValidHexColor(text_color)) return res.status(400).json({ error: "Invalid text_color" });
                updates.push(`text_color = $${i++}`);
                values.push(text_color);
            }

            if (updates.length === 0) {
                return res.status(400).json({ error: "No supported fields to update" });
            }

            values.push(userId);

            const { rows } = await pool.query(
                `update profiles
                 set ${updates.join(", ")}, updated_at = now()
                 where id = $${i}
       returning id, email, username, displayname, role, tokens, bio, color, text_color,
                 games_finished, games_won, boards_generated, money_won, created_at, updated_at`,
                values
            );

            if (!rows.length) {
                // This is the real clue:
                return res.status(404).json({ error: "Not found", debug: { userId } });
            }

            res.json({ profile: rows[0] });
        } catch (e) {
            console.error("PATCH /api/profile/me failed:", e);
            res.status(500).json({ error: "Failed to update profile" });
        }
    });
}

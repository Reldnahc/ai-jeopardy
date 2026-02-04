// backend/http/authRoutes.js
import bcrypt from "bcryptjs";
import { pool } from "../config/pg.js";
import { signJwt, verifyJwt } from "../auth/jwt.js";

function normalizeEmail(email) {
    const v = String(email ?? "").trim().toLowerCase();
    return v.length ? v : null;
}

function normalizeUsername(username) {
    return String(username ?? "").trim().toLowerCase();
}

export function registerAuthRoutes(app) {
    // Signup (email optional)
    app.post("/api/auth/signup", async (req, res) => {
        try {
            const usernameRaw = String(req.body?.username ?? "");
            const username = normalizeUsername(usernameRaw);

            const displayname =
                String(req.body?.displayname ?? "").trim() ||
                usernameRaw.trim() ||
                username;

            const email = normalizeEmail(req.body?.email);
            const password = String(req.body?.password ?? "");

            if (!username || !password) {
                return res.status(400).json({ error: "Missing username/password" });
            }

            const passwordHash = await bcrypt.hash(password, 12);

            const { rows } = await pool.query(
                `insert into profiles (email, username, displayname, password_hash)
                 values ($1, $2, $3, $4)
                     returning id, email, username, displayname, role, color, text_color`,
                [email, username, displayname, passwordHash]
            );

            const user = rows[0];
            const token = signJwt({ id: user.id, username: user.username, role: user.role });

            res.json({ token, user });
        } catch (e) {
            const msg = String(e?.message || "");
            if (msg.includes("duplicate key value")) {
                return res.status(409).json({ error: "Username (or email) already exists" });
            }
            console.error("POST /api/auth/signup failed:", e);
            res.status(500).json({ error: "Signup failed" });
        }
    });

    // Login (username only)
    app.post("/api/auth/login", async (req, res) => {
        try {
            const username = normalizeUsername(req.body?.username);
            const password = String(req.body?.password ?? "");

            if (!username || !password) {
                return res.status(400).json({ error: "Missing username/password" });
            }

            const { rows } = await pool.query(
                `select id, email, username, role, displayname, color, text_color, password_hash
         from profiles
         where username = $1
         limit 1`,
                [username]
            );

            if (!rows.length) return res.status(401).json({ error: "Invalid credentials" });

            const user = rows[0];
            const ok = await bcrypt.compare(password, user.password_hash);
            if (!ok) return res.status(401).json({ error: "Invalid credentials" });

            const token = signJwt({ id: user.id, username: user.username, role: user.role });

            delete user.password_hash;
            res.json({ token, user });
        } catch (e) {
            console.error("POST /api/auth/login failed:", e);
            res.status(500).json({ error: "Login failed" });
        }
    });

    // "Me" endpoint
    app.get("/api/auth/me", async (req, res) => {
        try {
            const header = String(req.headers.authorization || "");
            if (!header.startsWith("Bearer ")) return res.status(401).json({ error: "Missing token" });

            const token = header.slice("Bearer ".length);
            const payload = verifyJwt(token);

            const { rows } = await pool.query(
                `select id, email, username, role, displayname, color, text_color
                 from profiles
                 where id = $1`,
                [payload.sub]
            );

            if (!rows.length) return res.status(401).json({ error: "User not found" });
            res.json({ user: rows[0] });
        } catch {
            res.status(401).json({ error: "Invalid token" });
        }
    });
}

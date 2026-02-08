// backend/http/authRoutes.js
import bcrypt from "bcryptjs";
import { signJwt, verifyJwt } from "../auth/jwt.js";

function normalizeEmail(email) {
    const v = String(email ?? "").trim().toLowerCase();
    return v.length ? v : null;
}

function normalizeUsername(username) {
    return String(username ?? "").trim().toLowerCase();
}

export function registerAuthRoutes(app, repos) {
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

            const user = await repos.profiles.insertProfile(
                email,
                usernameRaw,
                displayname,
                passwordHash,
            );

            if (!user) {
                return res.status(500).json({ error: "Signup failed" });
            }

            const token = signJwt({ sub: user.id, username: user.username, role: user.role });
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

            const user = await repos.profiles.getLoginRowByUsername(username);

            if (!user) return res.status(401).json({ error: "Invalid credentials" });

            const ok = await bcrypt.compare(password, user.password_hash);
            if (!ok) return res.status(401).json({ error: "Invalid credentials" });

            const token = signJwt({ sub: user.id, username: user.username, role: user.role });

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

            const userId = payload.sub || payload.id;
            if (!userId) return res.status(401).json({ error: "Invalid token payload" });

            const user = await repos.profiles.getPublicUserById(userId);
            if (!user) return res.status(401).json({ error: "User not found" });

            res.json({ user });
        } catch {
            res.status(401).json({ error: "Invalid token" });
        }
    });
}

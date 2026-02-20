// backend/http/authRoutes.ts
import type { Application, Request, Response } from "express";
import bcrypt from "bcryptjs";
import { signJwt, verifyJwt } from "../auth/jwt.js";
import type { Repos } from "../repositories/index.js";
import { containsProfanity } from "../services/profanityService.js";

type JwtPayload = {
  sub?: string;
  id?: string;
  userId?: string;
  username?: string;
  role?: string;
  iat?: number;
  exp?: number;
  [key: string]: unknown;
};

export type AuthRepos = Pick<Repos, "profiles">;

function normalizeEmail(email: unknown): string | null {
  const v = String(email ?? "")
    .trim()
    .toLowerCase();
  return v.length ? v : null;
}

function normalizeUsername(username: unknown): string {
  return String(username ?? "")
    .trim()
    .toLowerCase();
}

function asRecord(v: unknown): Record<string, unknown> {
  return typeof v === "object" && v !== null ? (v as Record<string, unknown>) : {};
}

export function registerAuthRoutes(app: Application, repos: AuthRepos) {
  // Signup (email optional)
  app.post("/api/auth/signup", async (req: Request, res: Response) => {
    try {
      const body = asRecord(req.body);

      const usernameRaw = String(body.username ?? "");
      const username = normalizeUsername(usernameRaw);

      // Profanity checks
      if (containsProfanity(usernameRaw) || containsProfanity(username)) {
        return res.status(400).json({ error: "name contains prohibited language." });
      }

      const displayname = String(body.displayname ?? "").trim() || usernameRaw.trim() || username;

      const email = normalizeEmail(body.email);
      const password = String(body.password ?? "");

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

      const token = signJwt(user.id, user.username, user.role);
      return res.json({ token, user });
    } catch (e: unknown) {
      const msg = String((e as { message?: unknown } | null | undefined)?.message ?? "");

      if (msg.includes("duplicate key value")) {
        return res.status(409).json({ error: "Username (or email) already exists" });
      }

      console.error("POST /api/auth/signup failed:", e);
      return res.status(500).json({ error: "Signup failed" });
    }
  });

  // Login (username only)
  app.post("/api/auth/login", async (req: Request, res: Response) => {
    try {
      const body = asRecord(req.body);

      const username = normalizeUsername(body.username);
      const password = String(body.password ?? "");

      if (!username || !password) {
        return res.status(400).json({ error: "Missing username/password" });
      }

      const user = await repos.profiles.getLoginRowByUsername(username);

      if (!user) return res.status(401).json({ error: "Invalid credentials" });

      const ok = await bcrypt.compare(password, user.password_hash);
      if (!ok) return res.status(401).json({ error: "Invalid credentials" });

      const token = signJwt(user.id, user.username, user.role);

      // don't leak hash
      delete user.password_hash;
      return res.json({ token, user });
    } catch (e) {
      console.error("POST /api/auth/login failed:", e);
      return res.status(500).json({ error: "Login failed" });
    }
  });

  // "Me" endpoint
  app.get("/api/auth/me", async (req: Request, res: Response) => {
    try {
      const header = String(req.headers.authorization || "");
      if (!header.startsWith("Bearer ")) {
        return res.status(401).json({ error: "Missing token" });
      }

      const token = header.slice("Bearer ".length);
      const payload = verifyJwt(token) as JwtPayload;

      const userId = (payload.sub || payload.id) as string | undefined;
      if (!userId) return res.status(401).json({ error: "Invalid token payload" });

      const user = await repos.profiles.getPublicUserById(userId);
      if (!user) return res.status(401).json({ error: "User not found" });

      return res.json({ user });
    } catch {
      return res.status(401).json({ error: "Invalid token" });
    }
  });
}

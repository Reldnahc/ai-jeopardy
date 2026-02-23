// backend/services/userService.js
import { verifyJwt } from "../auth/jwt.js";

type VerifiedToken = {
  id: string | null;
  username: string | null;
  role: string;
  raw: unknown;
};

type RequestLike = {
  headers?: Record<string, unknown>;
};

type PlayerLike = {
  username?: string | null;
};

export function verifyAccessToken(accessToken: string | null | undefined): VerifiedToken | null {
  if (!accessToken) return null;

  try {
    const payload = verifyJwt(accessToken);

    // payload was signed as { sub, username, role }
    return {
      id: payload?.sub ?? null,
      username: payload?.username ?? null,
      role: payload?.role ?? "default",
      raw: payload,
    };
  } catch {
    return null;
  }
}

export function getBearerToken(req: RequestLike | null | undefined): string | null {
  const h = req?.headers?.authorization || req?.headers?.Authorization;
  const s = String(h ?? "");
  if (!s.toLowerCase().startsWith("bearer ")) return null;
  return s.slice(7).trim();
}

export function playerStableId(p: PlayerLike | null | undefined): string {
  const u = String(p?.username ?? "")
    .trim()
    .toLowerCase();
  if (!u) return ""; // or throw/log loudly
  return u;
}

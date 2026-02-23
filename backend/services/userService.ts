// backend/services/userService.js
import { verifyJwt } from "../auth/jwt.js";

export function verifyAccessToken(accessToken) {
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

// Convenience for "Authorization: Bearer ..."
export function getBearerToken(req) {
  const h = req?.headers?.authorization || req?.headers?.Authorization;
  const s = String(h ?? "");
  if (!s.toLowerCase().startsWith("bearer ")) return null;
  return s.slice(7).trim();
}

export function playerStableId(p) {
  const u = String(p?.username ?? "")
    .trim()
    .toLowerCase();
  if (!u) return ""; // or throw/log loudly
  return u;
}

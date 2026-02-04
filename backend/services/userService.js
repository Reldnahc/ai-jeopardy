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
    if (typeof p?.playerKey === "string" && p.playerKey.trim()) return p.playerKey.trim();
    if (typeof p?.id === "string" && p.id.trim()) return p.id.trim(); // ws.id fallback
    return String(p?.name ?? "").trim();
}
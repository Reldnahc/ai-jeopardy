import { verifyJwt } from "../auth/jwt.js";

export function requireAuth(req, res, next) {
    const header = String(req.headers.authorization || "");
    if (!header.startsWith("Bearer ")) {
        return res.status(401).json({ error: "Missing token" });
    }

    try {
        const token = header.slice("Bearer ".length);
        req.user = verifyJwt(token); // { sub, username, role, iat, exp }
        next();
    } catch {
        return res.status(401).json({ error: "Invalid token" });
    }
}

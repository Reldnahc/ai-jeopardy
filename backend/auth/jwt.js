// backend/auth/jwt.js
import jwt from "jsonwebtoken";

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) throw new Error("JWT_SECRET is required");

export function signJwt({ sub, username, role }) {
    return jwt.sign(
        { sub, username, role },
        JWT_SECRET,
        { expiresIn: "7d" }
    );
}

export function verifyJwt(token) {
    return jwt.verify(token, JWT_SECRET);
}

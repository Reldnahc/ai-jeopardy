// backend/auth/jwt.ts
import jwt, { type JwtPayload } from "jsonwebtoken";
import { env } from "../config/env.js";

export type AuthJwtPayload = JwtPayload & {
  sub: string; // user id
  username: string;
  role: string;
};

const JWT_SECRET = env.JWT_SECRET;
const JWT_EXPIRES_IN = "7d";
const JWT_ALGORITHM: jwt.Algorithm = "HS256";

export function signJwt(sub: string, username: string, role: string): string {
  const payload: AuthJwtPayload = {
    sub,
    username,
    role,
  };

  return jwt.sign(payload, JWT_SECRET, {
    expiresIn: JWT_EXPIRES_IN,
    algorithm: JWT_ALGORITHM,
  });
}

export function verifyJwt(token: string): AuthJwtPayload {
  const decoded = jwt.verify(token, JWT_SECRET, {
    algorithms: [JWT_ALGORITHM],
  });

  if (typeof decoded !== "object" || !decoded) {
    throw new Error("Invalid JWT payload");
  }

  return decoded as AuthJwtPayload;
}

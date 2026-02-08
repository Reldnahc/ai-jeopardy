// backend/http/requireAuth.ts
import type { NextFunction, Request, Response } from "express";
import { verifyJwt } from "../auth/jwt.js";

export type JwtUser = {
  sub?: string;
  id?: string;
  userId?: string;
  username?: string;
  role?: string;
  iat?: number;
  exp?: number;
  [key: string]: unknown;
};

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {

    interface Request {
      user?: JwtUser;
    }
  }
}

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  const header = String(req.headers.authorization || "");
  if (!header.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Missing token" });
  }

  try {
    const token = header.slice("Bearer ".length);
    req.user = verifyJwt(token) as JwtUser; // { sub, username, role, iat, exp }
    return next();
  } catch {
    return res.status(401).json({ error: "Invalid token" });
  }
}

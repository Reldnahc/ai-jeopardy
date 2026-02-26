import { describe, expect, it } from "vitest";
import jwt from "jsonwebtoken";
import { signJwt, verifyJwt } from "./jwt.js";
import { env } from "../config/env.js";

describe("jwt", () => {
  it("signs and verifies auth payload", () => {
    const token = signJwt("u1", "alice", "admin");
    const payload = verifyJwt(token);

    expect(payload.sub).toBe("u1");
    expect(payload.username).toBe("alice");
    expect(payload.role).toBe("admin");
    expect(typeof payload.exp).toBe("number");
  });

  it("throws for invalid token", () => {
    expect(() => verifyJwt("not-a-jwt")).toThrow();
  });

  it("throws when decoded payload is not an object", () => {
    const token = jwt.sign("plain-text-payload", env.JWT_SECRET, {
      algorithm: "HS256",
    });
    expect(() => verifyJwt(token)).toThrow("Invalid JWT payload");
  });
});

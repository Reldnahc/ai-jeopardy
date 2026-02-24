import { describe, expect, it } from "vitest";
import { signJwt, verifyJwt } from "./jwt.js";

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
});


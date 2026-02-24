import { describe, expect, it, vi } from "vitest";
import type { Request, Response } from "express";
import { requireAuth } from "./requireAuth.js";

const { verifyJwt } = vi.hoisted(() => ({
  verifyJwt: vi.fn(),
}));

vi.mock("../auth/jwt.js", () => ({
  verifyJwt,
}));

describe("requireAuth", () => {
  it("rejects when bearer token is missing", () => {
    const req = { headers: {} } as Request;
    const status = vi.fn(() => ({ json: jsonSpy }));
    const jsonSpy = vi.fn();
    const res = { status } as unknown as Response;
    const next = vi.fn();

    requireAuth(req, res, next);

    expect(status).toHaveBeenCalledWith(401);
    expect(jsonSpy).toHaveBeenCalledWith({ error: "Missing token" });
    expect(next).not.toHaveBeenCalled();
  });

  it("attaches user and calls next on valid token", () => {
    verifyJwt.mockReturnValueOnce({ sub: "u1", username: "alice", role: "admin" });
    const req = { headers: { authorization: "Bearer abc" } } as Request;
    const res = { status: vi.fn(), json: vi.fn() } as unknown as Response;
    const next = vi.fn();

    requireAuth(req, res, next);

    expect(verifyJwt).toHaveBeenCalledWith("abc");
    expect(req.user?.sub).toBe("u1");
    expect(next).toHaveBeenCalled();
  });

  it("rejects invalid token", () => {
    verifyJwt.mockImplementationOnce(() => {
      throw new Error("bad");
    });
    const req = { headers: { authorization: "Bearer bad" } } as Request;
    const status = vi.fn(() => ({ json: jsonSpy }));
    const jsonSpy = vi.fn();
    const res = { status } as unknown as Response;
    const next = vi.fn();

    requireAuth(req, res, next);

    expect(status).toHaveBeenCalledWith(401);
    expect(jsonSpy).toHaveBeenCalledWith({ error: "Invalid token" });
    expect(next).not.toHaveBeenCalled();
  });
});


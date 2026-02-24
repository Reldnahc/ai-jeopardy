import express from "express";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { hash, compare, signJwt, verifyJwt, containsProfanity } = vi.hoisted(() => ({
  hash: vi.fn(async () => "hashed"),
  compare: vi.fn(async () => true),
  signJwt: vi.fn(() => "token-123"),
  verifyJwt: vi.fn(),
  containsProfanity: vi.fn(() => false),
}));

vi.mock("bcryptjs", () => ({
  default: { hash, compare },
}));

vi.mock("../auth/jwt.js", () => ({
  signJwt,
  verifyJwt,
}));

vi.mock("../services/profanityService.js", () => ({
  containsProfanity,
}));

import { registerAuthRoutes } from "./authRoutes.js";

async function request(
  app: express.Express,
  method: "GET" | "POST",
  path: string,
  opts: { body?: unknown; auth?: string } = {},
) {
  const server = app.listen(0);
  await new Promise<void>((resolve) => server.once("listening", resolve));
  const addr = server.address();
  if (!addr || typeof addr === "string") throw new Error("No address");
  const res = await fetch(`http://127.0.0.1:${addr.port}${path}`, {
    method,
    headers: {
      "content-type": "application/json",
      ...(opts.auth ? { authorization: opts.auth } : {}),
    },
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  const json = await res.json();
  server.close();
  return { status: res.status, json };
}

describe("authRoutes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    containsProfanity.mockReturnValue(false);
  });

  it("signup validates required fields and profanity", async () => {
    const app = express();
    app.use(express.json());
    registerAuthRoutes(app, { profiles: {} } as never);

    const missing = await request(app, "POST", "/api/auth/signup", { body: { username: "" } });
    expect(missing.status).toBe(400);

    containsProfanity.mockReturnValueOnce(true);
    const profane = await request(app, "POST", "/api/auth/signup", {
      body: { username: "bad", password: "x" },
    });
    expect(profane.status).toBe(400);
  });

  it("signup returns token and created user", async () => {
    const app = express();
    app.use(express.json());
    const insertProfile = vi.fn(async () => ({
      id: "u1",
      username: "alice",
      displayname: "Alice",
      role: "default",
    }));
    registerAuthRoutes(app, { profiles: { insertProfile } } as never);

    const out = await request(app, "POST", "/api/auth/signup", {
      body: { username: " Alice ", password: "pw", email: "a@b.com" },
    });

    expect(out.status).toBe(200);
    expect(out.json.token).toBe("token-123");
    expect(hash).toHaveBeenCalledWith("pw", 12);
    expect(insertProfile).toHaveBeenCalled();
  });

  it("signup handles duplicate and generic failures", async () => {
    const app = express();
    app.use(express.json());
    const insertProfile = vi
      .fn()
      .mockRejectedValueOnce(new Error("duplicate key value violates unique"))
      .mockResolvedValueOnce(null)
      .mockRejectedValueOnce(new Error("boom"));
    registerAuthRoutes(app, { profiles: { insertProfile } } as never);

    const duplicate = await request(app, "POST", "/api/auth/signup", {
      body: { username: "alice", password: "pw" },
    });
    expect(duplicate.status).toBe(409);

    const nullUser = await request(app, "POST", "/api/auth/signup", {
      body: { username: "alice", password: "pw" },
    });
    expect(nullUser.status).toBe(500);

    const generic = await request(app, "POST", "/api/auth/signup", {
      body: { username: "alice", password: "pw" },
    });
    expect(generic.status).toBe(500);
  });

  it("login handles invalid credentials and success", async () => {
    const app = express();
    app.use(express.json());
    const getLoginRowByUsername = vi
      .fn()
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({
        id: "u1",
        username: "alice",
        role: "default",
        password_hash: "hash",
      })
      .mockResolvedValueOnce({
        id: "u1",
        username: "alice",
        role: "default",
        password_hash: "hash",
      });
    compare.mockResolvedValueOnce(false).mockResolvedValueOnce(true);
    registerAuthRoutes(app, { profiles: { getLoginRowByUsername } } as never);

    const bad = await request(app, "POST", "/api/auth/login", {
      body: { username: "alice", password: "pw" },
    });
    expect(bad.status).toBe(401);

    const badPassword = await request(app, "POST", "/api/auth/login", {
      body: { username: "alice", password: "pw" },
    });
    expect(badPassword.status).toBe(401);

    const good = await request(app, "POST", "/api/auth/login", {
      body: { username: "alice", password: "pw" },
    });
    expect(good.status).toBe(200);
    expect(good.json.user.password_hash).toBeUndefined();
    expect(good.json.token).toBe("token-123");
  });

  it("login validates payload and handles exceptions", async () => {
    const app = express();
    app.use(express.json());
    const getLoginRowByUsername = vi.fn(async () => {
      throw new Error("db");
    });
    registerAuthRoutes(app, { profiles: { getLoginRowByUsername } } as never);

    const missing = await request(app, "POST", "/api/auth/login", {
      body: { username: "", password: "" },
    });
    expect(missing.status).toBe(400);

    const err = await request(app, "POST", "/api/auth/login", {
      body: { username: "alice", password: "pw" },
    });
    expect(err.status).toBe(500);
  });

  it("me endpoint validates token and resolves user", async () => {
    const app = express();
    app.use(express.json());
    const getPublicUserById = vi
      .fn()
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ id: "u1", username: "alice" });
    registerAuthRoutes(app, { profiles: { getPublicUserById } } as never);

    const missing = await request(app, "GET", "/api/auth/me");
    expect(missing.status).toBe(401);

    verifyJwt.mockReturnValueOnce({ sub: "u1" });
    const notFound = await request(app, "GET", "/api/auth/me", { auth: "Bearer tok" });
    expect(notFound.status).toBe(401);

    verifyJwt.mockReturnValueOnce({ sub: "u1" });
    const ok = await request(app, "GET", "/api/auth/me", { auth: "Bearer tok" });
    expect(ok.status).toBe(200);
    expect(ok.json.user.username).toBe("alice");
  });

  it("me endpoint handles invalid payload and verify errors", async () => {
    const app = express();
    app.use(express.json());
    registerAuthRoutes(app, { profiles: { getPublicUserById: vi.fn(async () => null) } } as never);

    verifyJwt.mockReturnValueOnce({});
    const invalidPayload = await request(app, "GET", "/api/auth/me", { auth: "Bearer tok" });
    expect(invalidPayload.status).toBe(401);
    expect(invalidPayload.json.error).toBe("Invalid token payload");

    verifyJwt.mockImplementationOnce(() => {
      throw new Error("bad");
    });
    const invalidToken = await request(app, "GET", "/api/auth/me", { auth: "Bearer tok" });
    expect(invalidToken.status).toBe(401);
    expect(invalidToken.json.error).toBe("Invalid token");
  });
});

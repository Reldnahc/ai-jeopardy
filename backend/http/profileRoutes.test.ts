import express from "express";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { verifyJwt, containsProfanity } = vi.hoisted(() => ({
  verifyJwt: vi.fn(),
  containsProfanity: vi.fn(() => false),
}));

vi.mock("../auth/jwt.js", () => ({
  verifyJwt,
}));

vi.mock("../services/profanityService.js", () => ({
  containsProfanity,
}));

import { registerProfileRoutes } from "./profileRoutes.js";

async function request(
  app: express.Express,
  method: "GET" | "PATCH",
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

describe("profileRoutes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    containsProfanity.mockReturnValue(false);
  });

  it("search returns empty list for blank query and clamps limit", async () => {
    const app = express();
    app.use(express.json());
    const searchProfiles = vi.fn(async () => [{ username: "alice" }]);
    registerProfileRoutes(app, { profiles: { searchProfiles }, boards: {} } as never);

    const blank = await request(app, "GET", "/api/profile/search?q=");
    expect(blank.status).toBe(200);
    expect(blank.json).toEqual({ users: [] });
    expect(searchProfiles).not.toHaveBeenCalled();

    const out = await request(app, "GET", "/api/profile/search?q=al&limit=999");
    expect(out.status).toBe(200);
    expect(searchProfiles).toHaveBeenCalledWith("al", 20);
  });

  it("me endpoint requires auth and returns profile", async () => {
    const app = express();
    app.use(express.json());
    const getMeProfile = vi.fn(async () => ({ username: "alice" }));
    registerProfileRoutes(app, { profiles: { getMeProfile }, boards: {} } as never);

    const unauthorized = await request(app, "GET", "/api/profile/me");
    expect(unauthorized.status).toBe(401);

    verifyJwt.mockReturnValueOnce({ sub: "u1" });
    const ok = await request(app, "GET", "/api/profile/me", { auth: "Bearer tok" });
    expect(ok.status).toBe(200);
    expect(ok.json.profile.username).toBe("alice");
  });

  it("boards and batch routes normalize inputs", async () => {
    const app = express();
    app.use(express.json());
    const listBoardsByUsername = vi.fn(async () => [{ id: 1 }]);
    const getPublicProfilesByUsernames = vi.fn(async () => [{ username: "alice" }]);
    registerProfileRoutes(
      app,
      {
        profiles: { getPublicProfilesByUsernames },
        boards: { listBoardsByUsername },
      } as never,
    );

    const boards = await request(app, "GET", "/api/profile/ Alice /boards?limit=500&offset=-9");
    expect(boards.status).toBe(200);
    expect(listBoardsByUsername).toHaveBeenCalledWith("alice", 50, 0);

    const batch = await request(app, "GET", "/api/profile/batch?u=Alice,bob");
    expect(batch.status).toBe(200);
    expect(getPublicProfilesByUsernames).toHaveBeenCalledWith(["alice", "bob"]);
  });
});


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

type FnMock = ReturnType<typeof vi.fn>;
type TestProfileRepos = {
  profiles: {
    getMeProfile: FnMock;
    searchProfiles: FnMock;
    getPublicProfilesByUsernames: FnMock;
    getPublicProfileByUsername: FnMock;
    updateCustomization: FnMock;
    getRoleById: FnMock;
    setRoleById: FnMock;
  };
  boards: {
    listBoardsByUsername: FnMock;
  };
};

function registerTestRoutes(app: express.Express, repos: TestProfileRepos) {
  registerProfileRoutes(app, repos as unknown as Parameters<typeof registerProfileRoutes>[1]);
}

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

function makeRepos(overrides: Partial<TestProfileRepos["profiles"]> = {}): TestProfileRepos {
  return {
    profiles: {
      getMeProfile: vi.fn(async () => ({ username: "alice" })),
      searchProfiles: vi.fn(async () => [{ username: "alice" }]),
      getPublicProfilesByUsernames: vi.fn(async () => [{ username: "alice" }]),
      getPublicProfileByUsername: vi.fn(async () => ({ id: "target-1", username: "alice" })),
      updateCustomization: vi.fn(async () => ({ id: "u1", username: "alice" })),
      getRoleById: vi.fn(async () => "admin"),
      setRoleById: vi.fn(async () => {}),
      ...overrides,
    },
    boards: {
      listBoardsByUsername: vi.fn(async () => [{ id: 1 }]),
    },
  };
}

describe("profileRoutes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    containsProfanity.mockReturnValue(false);
  });

  it("search returns empty list for blank query and clamps limit", async () => {
    const app = express();
    app.use(express.json());
    const repos = makeRepos();
    registerTestRoutes(app, repos);

    const blank = await request(app, "GET", "/api/profile/search?q=");
    expect(blank.status).toBe(200);
    expect(blank.json).toEqual({ users: [] });
    expect(repos.profiles.searchProfiles).not.toHaveBeenCalled();

    const out = await request(app, "GET", "/api/profile/search?q=al&limit=999");
    expect(out.status).toBe(200);
    expect(repos.profiles.searchProfiles).toHaveBeenCalledWith("al", 20);
  });

  it("me endpoint requires auth and handles not found", async () => {
    const app = express();
    app.use(express.json());
    const repos = makeRepos({ getMeProfile: vi.fn(async () => null) });
    registerTestRoutes(app, repos);

    const unauthorized = await request(app, "GET", "/api/profile/me");
    expect(unauthorized.status).toBe(401);

    verifyJwt.mockReturnValueOnce({ sub: "u1" });
    const missing = await request(app, "GET", "/api/profile/me", { auth: "Bearer tok" });
    expect(missing.status).toBe(404);
  });

  it("me patch rejects profanity and updates supported fields", async () => {
    const app = express();
    app.use(express.json());
    const repos = makeRepos();
    registerTestRoutes(app, repos);

    containsProfanity.mockReturnValueOnce(true);
    verifyJwt.mockReturnValueOnce({ sub: "u1" });
    const bad = await request(app, "PATCH", "/api/profile/me", {
      auth: "Bearer tok",
      body: { bio: "bad words" },
    });
    expect(bad.status).toBe(400);

    verifyJwt.mockReturnValueOnce({ sub: "u1" });
    const ok = await request(app, "PATCH", "/api/profile/me", {
      auth: "Bearer tok",
      body: { bio: "Hello", font: "outfit", color: "#fff" },
    });
    expect(ok.status).toBe(200);
    expect(repos.profiles.updateCustomization).toHaveBeenCalledWith(
      "u1",
      expect.objectContaining({ bio: "Hello", font: "outfit", color: "#fff" }),
    );
  });

  it("me patch handles unauthorized, no supported fields, and repository errors", async () => {
    const app = express();
    app.use(express.json());
    const repos = makeRepos();
    registerTestRoutes(app, repos);

    const unauthorized = await request(app, "PATCH", "/api/profile/me", {
      auth: "Bearer tok",
      body: { bio: "hello" },
    });
    expect(unauthorized.status).toBe(401);

    verifyJwt.mockReturnValueOnce({ sub: "u1" });
    (repos.profiles.updateCustomization as ReturnType<typeof vi.fn>).mockResolvedValueOnce(null);
    const unsupported = await request(app, "PATCH", "/api/profile/me", {
      auth: "Bearer tok",
      body: { unsupported: true },
    });
    expect(unsupported.status).toBe(400);

    verifyJwt.mockReturnValueOnce({ sub: "u1" });
    (repos.profiles.updateCustomization as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
      new Error("boom"),
    );
    const crashed = await request(app, "PATCH", "/api/profile/me", {
      auth: "Bearer tok",
      body: { bio: "x" },
    });
    expect(crashed.status).toBe(500);
  });

  it("boards and batch routes normalize inputs", async () => {
    const app = express();
    app.use(express.json());
    const repos = makeRepos();
    registerTestRoutes(app, repos);

    const boards = await request(app, "GET", "/api/profile/ Alice /boards?limit=500&offset=-9");
    expect(boards.status).toBe(200);
    expect(repos.boards.listBoardsByUsername).toHaveBeenCalledWith("alice", 50, 0);

    const batch = await request(app, "GET", "/api/profile/batch?u=Alice,bob");
    expect(batch.status).toBe(200);
    expect(repos.profiles.getPublicProfilesByUsernames).toHaveBeenCalledWith(["alice", "bob"]);

    const emptyBatch = await request(app, "GET", "/api/profile/batch");
    expect(emptyBatch.status).toBe(200);
    expect(emptyBatch.json).toEqual({ profiles: [] });
  });

  it("boards route validates username and defaults invalid pagination", async () => {
    const app = express();
    app.use(express.json());
    const repos = makeRepos();
    registerTestRoutes(app, repos);

    const missingUsername = await request(app, "GET", "/api/profile/%20/boards");
    expect(missingUsername.status).toBe(400);

    const out = await request(app, "GET", "/api/profile/alice/boards?limit=abc&offset=def");
    expect(out.status).toBe(200);
    expect(repos.boards.listBoardsByUsername).toHaveBeenCalledWith("alice", 10, 0);
  });

  it("public profile route validates username", async () => {
    const app = express();
    app.use(express.json());
    registerTestRoutes(app, makeRepos());

    const out = await request(app, "GET", "/api/profile/%20");
    expect(out.status).toBe(400);
  });

  it("public profile route returns not found when missing", async () => {
    const app = express();
    app.use(express.json());
    const repos = makeRepos({ getPublicProfileByUsername: vi.fn(async () => null) });
    registerTestRoutes(app, repos);

    const out = await request(app, "GET", "/api/profile/alice");
    expect(out.status).toBe(404);
  });

  it("route handlers return 500 on repository exceptions", async () => {
    const app = express();
    app.use(express.json());
    const repos = makeRepos({
      searchProfiles: vi.fn(async () => Promise.reject(new Error("boom"))),
      getPublicProfilesByUsernames: vi.fn(async () => Promise.reject(new Error("boom"))),
      getPublicProfileByUsername: vi.fn(async () => Promise.reject(new Error("boom"))),
    });
    repos.boards.listBoardsByUsername = vi.fn(async () => Promise.reject(new Error("boom")));
    registerTestRoutes(app, repos);

    verifyJwt.mockReturnValueOnce({ sub: "u1" });
    repos.profiles.getMeProfile = vi.fn(async () => Promise.reject(new Error("boom")));
    const me = await request(app, "GET", "/api/profile/me", { auth: "Bearer tok" });
    expect(me.status).toBe(500);

    const search = await request(app, "GET", "/api/profile/search?q=x");
    expect(search.status).toBe(500);

    const boards = await request(app, "GET", "/api/profile/alice/boards");
    expect(boards.status).toBe(500);

    const batch = await request(app, "GET", "/api/profile/batch?u=alice");
    expect(batch.status).toBe(500);

    const pub = await request(app, "GET", "/api/profile/alice");
    expect(pub.status).toBe(500);
  });

  it("admin patch blocks peer/superior and banned actor", async () => {
    const app = express();
    app.use(express.json());
    const repos = makeRepos({
      getRoleById: vi.fn(async (id: string) => (id === "actor" ? "banned" : "default")),
    });
    registerTestRoutes(app, repos);

    verifyJwt.mockReturnValueOnce({ sub: "actor" });
    const banned = await request(app, "PATCH", "/api/profile/alice", {
      auth: "Bearer tok",
      body: { role: "default" },
    });
    expect(banned.status).toBe(403);

    (repos.profiles.getRoleById as ReturnType<typeof vi.fn>).mockImplementation(
      async (id: string) => (id === "actor" ? "admin" : "admin"),
    );
    verifyJwt.mockReturnValueOnce({ sub: "actor" });
    const peer = await request(app, "PATCH", "/api/profile/alice", {
      auth: "Bearer tok",
      body: { role: "default" },
    });
    expect(peer.status).toBe(403);

    (repos.profiles.getRoleById as ReturnType<typeof vi.fn>).mockImplementation(
      async (id: string) => (id === "actor" ? null : "default"),
    );
    verifyJwt.mockReturnValueOnce({ sub: "actor" });
    const noActorRole = await request(app, "PATCH", "/api/profile/alice", {
      auth: "Bearer tok",
      body: { role: "default" },
    });
    expect(noActorRole.status).toBe(403);
  });

  it("admin patch enforces role rules and supports successful role change", async () => {
    const app = express();
    app.use(express.json());
    const repos = makeRepos({
      getRoleById: vi.fn(async (id: string) => (id === "actor" ? "moderator" : "default")),
    });
    registerTestRoutes(app, repos);

    verifyJwt.mockReturnValueOnce({ sub: "actor" });
    const forbidGrant = await request(app, "PATCH", "/api/profile/alice", {
      auth: "Bearer tok",
      body: { role: "privileged" },
    });
    expect(forbidGrant.status).toBe(403);

    (repos.profiles.getRoleById as ReturnType<typeof vi.fn>).mockImplementation(
      async (id: string) => (id === "actor" ? "admin" : "default"),
    );
    verifyJwt.mockReturnValueOnce({ sub: "actor" });
    const ok = await request(app, "PATCH", "/api/profile/alice", {
      auth: "Bearer tok",
      body: { role: "moderator" },
    });
    expect(ok.status).toBe(200);
    expect(repos.profiles.setRoleById).toHaveBeenCalledWith("target-1", "moderator");

    verifyJwt.mockReturnValueOnce({ sub: "actor" });
    const noChanges = await request(app, "PATCH", "/api/profile/alice", {
      auth: "Bearer tok",
      body: {},
    });
    expect(noChanges.status).toBe(400);
  });

  it("admin patch covers bio moderation and ban branch", async () => {
    const app = express();
    app.use(express.json());
    const repos = makeRepos({
      getRoleById: vi.fn(async (id: string) => (id === "actor" ? "moderator" : "default")),
    });
    registerTestRoutes(app, repos);

    containsProfanity.mockReturnValueOnce(true);
    verifyJwt.mockReturnValueOnce({ sub: "actor" });
    const badBio = await request(app, "PATCH", "/api/profile/alice", {
      auth: "Bearer tok",
      body: { bio: "bad bio" },
    });
    expect(badBio.status).toBe(400);

    verifyJwt.mockReturnValueOnce({ sub: "actor" });
    const ban = await request(app, "PATCH", "/api/profile/alice", {
      auth: "Bearer tok",
      body: { role: "banned" },
    });
    expect(ban.status).toBe(200);
    expect(repos.profiles.setRoleById).toHaveBeenCalledWith("target-1", "banned");
  });

  it("admin patch returns 500 when target profile has no id or throws", async () => {
    const app = express();
    app.use(express.json());
    const repos = makeRepos({
      getPublicProfileByUsername: vi
        .fn()
        .mockResolvedValueOnce({ id: "", username: "alice" })
        .mockRejectedValueOnce(new Error("boom")),
    });
    registerTestRoutes(app, repos);

    verifyJwt.mockReturnValueOnce({ sub: "actor" });
    const missingId = await request(app, "PATCH", "/api/profile/alice", {
      auth: "Bearer tok",
      body: { role: "default" },
    });
    expect(missingId.status).toBe(500);

    verifyJwt.mockReturnValueOnce({ sub: "actor" });
    const crashed = await request(app, "PATCH", "/api/profile/alice", {
      auth: "Bearer tok",
      body: { role: "default" },
    });
    expect(crashed.status).toBe(500);
  });

  it("admin patch handles target-role-missing and additional forbidden branches", async () => {
    const app = express();
    app.use(express.json());
    const repos = makeRepos();
    registerTestRoutes(app, repos);

    verifyJwt.mockReturnValueOnce({ sub: "actor" });
    (repos.profiles.getRoleById as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce("admin")
      .mockResolvedValueOnce(null);
    const targetMissingRole = await request(app, "PATCH", "/api/profile/alice", {
      auth: "Bearer tok",
      body: { role: "default" },
    });
    expect(targetMissingRole.status).toBe(404);

    verifyJwt.mockReturnValueOnce({ sub: "actor" });
    (repos.profiles.getRoleById as ReturnType<typeof vi.fn>).mockImplementation(
      async (id: string) => (id === "actor" ? "default" : "default"),
    );
    const forbidBio = await request(app, "PATCH", "/api/profile/alice", {
      auth: "Bearer tok",
      body: { bio: "clean" },
    });
    expect(forbidBio.status).toBe(403);

    verifyJwt.mockReturnValueOnce({ sub: "actor" });
    (repos.profiles.getRoleById as ReturnType<typeof vi.fn>).mockImplementation(
      async (id: string) => (id === "actor" ? "default" : "user"),
    );
    const forbidBan = await request(app, "PATCH", "/api/profile/alice", {
      auth: "Bearer tok",
      body: { role: "banned" },
    });
    expect(forbidBan.status).toBe(403);

    verifyJwt.mockReturnValueOnce({ sub: "actor" });
    (repos.profiles.getRoleById as ReturnType<typeof vi.fn>).mockImplementation(
      async (id: string) => (id === "actor" ? "moderator" : "default"),
    );
    const forbidLadder = await request(app, "PATCH", "/api/profile/alice", {
      auth: "Bearer tok",
      body: { role: "default" },
    });
    expect(forbidLadder.status).toBe(403);
  });
});

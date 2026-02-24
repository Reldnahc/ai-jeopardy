import express from "express";
import { describe, expect, it, vi } from "vitest";
import { registerLeaderboardRoutes } from "./leaderboardRoutes.js";

async function request(app: express.Express, path: string) {
  const server = app.listen(0);
  await new Promise<void>((resolve) => server.once("listening", resolve));
  const addr = server.address();
  if (!addr || typeof addr === "string") throw new Error("No address");
  const res = await fetch(`http://127.0.0.1:${addr.port}${path}`);
  const json = await res.json();
  server.close();
  return { status: res.status, json };
}

describe("leaderboardRoutes", () => {
  it("passes query values through to repo", async () => {
    const app = express();
    const listLeaderboard = vi.fn(async () => [{ username: "alice", value: 1 }]);
    registerLeaderboardRoutes(app, { profiles: { listLeaderboard } } as never);

    const out = await request(app, "/api/leaderboard?stat=money_won&limit=20&offset=5");
    expect(out.status).toBe(200);
    expect(out.json.rows[0].username).toBe("alice");
    expect(listLeaderboard).toHaveBeenCalledWith("money_won", "20", "5");
  });

  it("returns 500 on repo failure", async () => {
    const app = express();
    registerLeaderboardRoutes(
      app,
      { profiles: { listLeaderboard: vi.fn(async () => Promise.reject(new Error("boom"))) } } as never,
    );

    const out = await request(app, "/api/leaderboard");
    expect(out.status).toBe(500);
    expect(out.json).toEqual({ error: "Failed to load leaderboard" });
  });
});


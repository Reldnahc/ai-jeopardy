import { describe, expect, it, vi } from "vitest";
import { createProfileLeaderboardRepo } from "./profile.leaderboard.js";

function makePool() {
  return { query: vi.fn() };
}

describe("profile.leaderboard", () => {
  it("sanitizes stat/limit/offset and normalizes response rows", async () => {
    const pool = makePool();
    pool.query.mockResolvedValueOnce({
      rows: [{ username: " Alice ", displayname: " Alice ", value: "12.5" }],
    });
    const repo = createProfileLeaderboardRepo(pool as never);

    const out = await repo.listLeaderboard("invalid", 999, -5);

    const [sql, values] = pool.query.mock.calls[0] as [string, unknown[]];
    expect(sql).toContain("coalesce(s.money_won, 0)");
    expect(values).toEqual([100, 0]);
    expect(out).toEqual([{ username: "alice", displayname: "Alice", value: 12.5 }]);
  });

  it("uses requested allowed stat", async () => {
    const pool = makePool();
    pool.query.mockResolvedValueOnce({ rows: [] });
    const repo = createProfileLeaderboardRepo(pool as never);

    await repo.listLeaderboard("games_won", 10, 0);
    const [sql] = pool.query.mock.calls[0] as [string, unknown[]];
    expect(sql).toContain("coalesce(s.games_won, 0)");
  });
});


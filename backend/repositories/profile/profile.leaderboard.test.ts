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

  it("falls back for non-finite limit/offset and nullish row fields", async () => {
    const pool = makePool();
    pool.query.mockResolvedValueOnce({
      rows: [
        { username: " Bob ", displayname: null, value: null },
        { username: null, displayname: null, value: undefined },
        { username: " Carol ", displayname: undefined, value: 3 },
        { username: undefined, displayname: undefined, value: 0 },
      ],
    });
    const repo = createProfileLeaderboardRepo(pool as never);

    const out = await repo.listLeaderboard("money_won", Number.NaN, Number.POSITIVE_INFINITY);

    expect(pool.query).toHaveBeenCalledWith(expect.any(String), [25, 0]);
    expect(out).toEqual([
      { username: "bob", displayname: "Bob", value: 0 },
      { username: "", displayname: "", value: 0 },
      { username: "carol", displayname: "Carol", value: 3 },
      { username: "", displayname: "", value: 0 },
    ]);
  });

  it("uses default stat/limit/offset when inputs are undefined", async () => {
    const pool = makePool();
    pool.query.mockResolvedValueOnce({ rows: [] });
    const repo = createProfileLeaderboardRepo(pool as never);

    await repo.listLeaderboard(undefined, undefined, undefined);

    const [sql, values] = pool.query.mock.calls[0] as [string, unknown[]];
    expect(sql).toContain("coalesce(s.money_won, 0)");
    expect(values).toEqual([25, 0]);
  });

  it("returns [] when query rows are nullish", async () => {
    const pool = makePool();
    pool.query.mockResolvedValueOnce({ rows: null });
    const repo = createProfileLeaderboardRepo(pool as never);

    await expect(repo.listLeaderboard("money_won", 10, 0)).resolves.toEqual([]);
  });
});

import { describe, expect, it, vi } from "vitest";
import { createProfileStatsRepo } from "./profile.stats.js";

function makePool() {
  return { query: vi.fn() };
}

describe("profile.stats", () => {
  it("returns null when id is missing or deltas are empty/invalid", async () => {
    const pool = makePool();
    pool.query.mockResolvedValueOnce({ rows: [] });
    const repo = createProfileStatsRepo(pool as never);

    expect(await repo.incrementStats("", { tokens: 5 })).toBeNull();
    expect(await repo.incrementStats("alice", { tokens: 0, games_won: Number.NaN })).toBeNull();
  });

  it("increments via username lookup and caches username->id", async () => {
    const pool = makePool();
    pool.query
      .mockResolvedValueOnce({ rows: [{ id: "u1" }] })
      .mockResolvedValueOnce({ rows: [{ id: "u1", tokens: 11 }] })
      .mockResolvedValueOnce({ rows: [{ id: "u1", tokens: 12 }] });
    const repo = createProfileStatsRepo(pool as never);

    await repo.incrementStats("Alice", { tokens: 1 });
    await repo.incrementStats("Alice", { tokens: 1 });

    expect(pool.query).toHaveBeenNthCalledWith(
      1,
      expect.stringContaining("select id from public.profiles"),
      ["alice"],
    );
    expect(pool.query).toHaveBeenCalledTimes(3);
  });

  it("incrementStatsById builds token/stat updates and wrappers delegate", async () => {
    const pool = makePool();
    pool.query.mockResolvedValue({ rows: [{ id: "u1" }] });
    const repo = createProfileStatsRepo(pool as never);

    await repo.incrementStatsById("u1", { tokens: 2, games_won: 1, ignored: 5 } as never);
    const [sql, values] = pool.query.mock.calls[0] as [string, unknown[]];
    expect(sql).toContain("up_tokens as");
    expect(sql).toContain("up_stats as");
    expect(values).toEqual([2, "u1", 1, "u1"]);

    await repo.incrementCluesSelected("alice");
    const [, wrapperValues] = pool.query.mock.calls[2] as [string, unknown[]];
    expect(wrapperValues).toEqual([1, "u1"]);
  });
});


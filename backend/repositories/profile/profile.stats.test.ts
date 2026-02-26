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
    expect(await repo.incrementStatsById(null, { tokens: 3 })).toBeNull();
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

  it("incrementStatsById supports token-only and stat-only deltas", async () => {
    const pool = makePool();
    pool.query.mockResolvedValue({ rows: [{ id: "u1", tokens: 1 }] });
    const repo = createProfileStatsRepo(pool as never);

    await repo.incrementStatsById("u1", { tokens: 4 });
    const [tokenSql, tokenValues] = pool.query.mock.calls[0] as [string, unknown[]];
    expect(tokenSql).toContain("up_tokens as");
    expect(tokenSql).not.toContain("up_stats as");
    expect(tokenValues).toEqual([4, "u1"]);

    await repo.incrementStatsById("u1", { games_won: 2 });
    const [statSql, statValues] = pool.query.mock.calls[1] as [string, unknown[]];
    expect(statSql).toContain("up_stats as");
    expect(statSql).not.toContain("up_tokens as");
    expect(statValues).toEqual([2, "u1"]);
  });

  it("returns null when username lookup misses and avoids cache write", async () => {
    const pool = makePool();
    pool.query.mockResolvedValueOnce({ rows: [] });
    const repo = createProfileStatsRepo(pool as never);

    expect(await repo.incrementStats("unknown", { tokens: 1 })).toBeNull();
    expect(pool.query).toHaveBeenCalledTimes(1);
  });

  it("returns null when update query returns no row", async () => {
    const pool = makePool();
    pool.query.mockResolvedValueOnce({ rows: [] });
    const repo = createProfileStatsRepo(pool as never);

    expect(await repo.incrementStatsById("u1", undefined as never)).toBeNull();
    expect(pool.query).not.toHaveBeenCalled();

    pool.query.mockResolvedValueOnce({ rows: [] });
    expect(await repo.incrementStatsById("u1", { tokens: 1 })).toBeNull();
  });

  it("wrapper defaults delegate with increment of 1", async () => {
    const pool = makePool();
    pool.query.mockResolvedValueOnce({ rows: [{ id: "u1" }] });
    pool.query.mockResolvedValue({ rows: [{ id: "u1" }] });
    const repo = createProfileStatsRepo(pool as never);

    const wrappers = [
      "incrementBoardsGenerated",
      "incrementGamesFinished",
      "incrementGamesWon",
      "incrementGamesPlayed",
      "incrementDailyDoubleFound",
      "incrementDailyDoubleCorrect",
      "incrementFinalJeopardyParticipations",
      "incrementFinalJeopardyCorrects",
      "incrementTimesBuzzed",
      "incrementTotalBuzzes",
      "incrementCorrectAnswers",
      "incrementWrongAnswers",
      "incrementCluesSkipped",
      "incrementTrueDailyDoubles",
    ] as const;

    for (const name of wrappers) {
      await repo[name]("alice");
    }

    expect(pool.query).toHaveBeenCalledTimes(1 + wrappers.length);
    for (let i = 0; i < wrappers.length; i++) {
      const [, values] = pool.query.mock.calls[i + 1] as [string, unknown[]];
      expect(values).toEqual([1, "u1"]);
    }
  });
});

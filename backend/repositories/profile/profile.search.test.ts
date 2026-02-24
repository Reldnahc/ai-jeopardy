import { describe, expect, it, vi } from "vitest";
import { createProfileSearchRepo } from "./profile.search.js";

function makePool() {
  return { query: vi.fn() };
}

describe("profile.search", () => {
  it("returns [] for short/empty queries", async () => {
    const pool = makePool();
    const repo = createProfileSearchRepo(pool as never);

    expect(await repo.searchProfiles("", 10)).toEqual([]);
    expect(await repo.searchProfiles("a", 10)).toEqual([]);
    expect(pool.query).not.toHaveBeenCalled();
  });

  it("clamps limit and queries using like/prefix patterns", async () => {
    const pool = makePool();
    pool.query.mockResolvedValueOnce({ rows: [{ username: "alice" }] });
    const repo = createProfileSearchRepo(pool as never);

    const out = await repo.searchProfiles("Ali", 999);

    expect(pool.query).toHaveBeenCalledWith(expect.stringContaining("where p.username ilike $1"), [
      "%Ali%",
      "Ali%",
      20,
    ]);
    expect(out).toEqual([{ username: "alice" }]);
  });
});


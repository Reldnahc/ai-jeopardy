import { describe, expect, it, vi } from "vitest";
import { createProfileReadRepo } from "./profile.read.js";

function makePool() {
  return { query: vi.fn() };
}

describe("profile.read", () => {
  it("returns null for missing ids/usernames", async () => {
    const pool = makePool();
    const repo = createProfileReadRepo(pool as never);

    expect(await repo.getPublicUserById(null)).toBeNull();
    expect(await repo.getMeProfile(undefined)).toBeNull();
    expect(await repo.getPublicProfileByUsername(" ")).toBeNull();
    expect(await repo.getIdByUsername(" ")).toBeNull();
    expect(pool.query).not.toHaveBeenCalled();
  });

  it("queries by normalized username for id/profile lookup", async () => {
    const pool = makePool();
    pool.query
      .mockResolvedValueOnce({ rows: [{ id: "u1" }] })
      .mockResolvedValueOnce({ rows: [{ id: "u1", username: "alice" }] });
    const repo = createProfileReadRepo(pool as never);

    expect(await repo.getIdByUsername(" Alice ")).toBe("u1");
    expect(await repo.getPublicProfileByUsername(" Alice ")).toEqual({ id: "u1", username: "alice" });
    expect(pool.query).toHaveBeenNthCalledWith(
      1,
      expect.stringContaining("select id from public.profiles"),
      ["alice"],
    );
    expect(pool.query).toHaveBeenNthCalledWith(2, expect.stringContaining("where p.username = $1"), ["alice"]);
  });

  it("getPublicProfilesByUsernames dedupes, limits, and preserves order", async () => {
    const pool = makePool();
    pool.query.mockResolvedValueOnce({
      rows: [
        { username: "bob", x: 2 },
        { username: "alice", x: 1 },
      ],
    });
    const repo = createProfileReadRepo(pool as never);

    const out = await repo.getPublicProfilesByUsernames([" Alice ", "bob", "alice", "", "carol"], { limit: 2 });

    expect(pool.query).toHaveBeenCalledWith(expect.stringContaining("where p.username = any"), [["alice", "bob"]]);
    expect(out).toEqual([
      { username: "alice", x: 1 },
      { username: "bob", x: 2 },
    ]);
  });
});


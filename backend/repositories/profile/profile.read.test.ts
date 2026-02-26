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

  it("returns null when lookups find no rows", async () => {
    const pool = makePool();
    pool.query.mockResolvedValue({ rows: [] });
    const repo = createProfileReadRepo(pool as never);

    expect(await repo.getPublicUserById("u1")).toBeNull();
    expect(await repo.getMeProfile("u1")).toBeNull();
    expect(await repo.getIdByUsername("alice")).toBeNull();
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

  it("getPublicProfilesByUsernames returns [] when normalized list is empty and clamps limits", async () => {
    const pool = makePool();
    const repo = createProfileReadRepo(pool as never);

    const empty = await repo.getPublicProfilesByUsernames(["", "   ", null], { limit: -10 });
    expect(empty).toEqual([]);
    expect(pool.query).not.toHaveBeenCalled();

    pool.query.mockResolvedValueOnce({ rows: [{ username: "a" }] });
    await repo.getPublicProfilesByUsernames(["a", "b"], { limit: 9999 });
    expect(pool.query).toHaveBeenCalledWith(expect.any(String), [["a", "b"]]);
  });

  it("getPublicProfilesByUsernames omits usernames missing from query result", async () => {
    const pool = makePool();
    pool.query.mockResolvedValueOnce({
      rows: [{ username: "bob", y: 2 }],
    });
    const repo = createProfileReadRepo(pool as never);

    const out = await repo.getPublicProfilesByUsernames(["alice", "bob", "carol"], { limit: 10 });
    expect(out).toEqual([{ username: "bob", y: 2 }]);
  });
});

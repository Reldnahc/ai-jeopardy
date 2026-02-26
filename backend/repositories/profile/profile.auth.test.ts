import { describe, expect, it, vi } from "vitest";
import { createProfileAuthRepo } from "./profile.auth.js";

function makePool() {
  return { query: vi.fn() };
}

describe("profile.auth", () => {
  it("insertProfile normalizes username/email and returns first row", async () => {
    const pool = makePool();
    pool.query.mockResolvedValueOnce({ rows: [{ id: "u1", username: "alice" }] });
    const repo = createProfileAuthRepo(pool as never);

    const out = await repo.insertProfile(" A@B.COM ", " Alice ", "Alice", "hash");

    expect(pool.query).toHaveBeenCalledWith(expect.stringContaining("insert into public.profiles"), [
      "a@b.com",
      "alice",
      "Alice",
      "hash",
    ]);
    expect(out).toEqual({ id: "u1", username: "alice" });
  });

  it("getLoginRowByUsername returns null for blank and returns row otherwise", async () => {
    const pool = makePool();
    const repo = createProfileAuthRepo(pool as never);
    expect(await repo.getLoginRowByUsername("  ")).toBeNull();
    expect(pool.query).not.toHaveBeenCalled();

    pool.query.mockResolvedValueOnce({ rows: [{ username: "alice", password_hash: "h" }] });
    const out = await repo.getLoginRowByUsername(" Alice ");
    expect(pool.query).toHaveBeenCalledWith(expect.stringContaining("where p.username = $1"), ["alice"]);
    expect(out).toEqual({ username: "alice", password_hash: "h" });
  });

  it("returns null when query returns no rows", async () => {
    const pool = makePool();
    const repo = createProfileAuthRepo(pool as never);

    pool.query.mockResolvedValueOnce({ rows: [] });
    await expect(repo.insertProfile("x@y.com", "user", "User", "hash")).resolves.toBeNull();

    pool.query.mockResolvedValueOnce({ rows: [] });
    await expect(repo.getLoginRowByUsername("user")).resolves.toBeNull();
  });
});

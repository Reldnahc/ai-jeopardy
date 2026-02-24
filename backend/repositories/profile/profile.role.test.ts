import { describe, expect, it, vi } from "vitest";
import { createProfileRoleRepo } from "./profile.role.js";

function makePool() {
  return { query: vi.fn() };
}

describe("profile.role", () => {
  it("getRoleById returns null when missing id or row", async () => {
    const pool = makePool();
    pool.query.mockResolvedValueOnce({ rows: [] });
    const repo = createProfileRoleRepo(pool as never);

    expect(await repo.getRoleById(null)).toBeNull();
    expect(await repo.getRoleById("u1")).toBeNull();
  });

  it("setRoleById validates inputs and lowercases role", async () => {
    const pool = makePool();
    pool.query.mockResolvedValueOnce({ rows: [{ role: "admin" }] });
    const repo = createProfileRoleRepo(pool as never);

    expect(await repo.setRoleById(undefined, "admin")).toEqual({ ok: false, role: null });
    expect(await repo.setRoleById("u1", "   ")).toEqual({ ok: false, role: null });
    expect(await repo.setRoleById("u1", " Admin ")).toEqual({ ok: true, role: "admin" });
    expect(pool.query).toHaveBeenCalledWith(expect.stringContaining("update public.profiles"), ["u1", "admin"]);
  });
});


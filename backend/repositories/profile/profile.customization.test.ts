import { describe, expect, it, vi } from "vitest";
import { createProfileCustomizationRepo } from "./profile.customization.js";

function makePool() {
  return { query: vi.fn() };
}

describe("profile.customization", () => {
  it("returns null when userId is missing or patch has no fields", async () => {
    const pool = makePool();
    const repo = createProfileCustomizationRepo(pool as never);

    expect(await repo.updateCustomization(null, { color: "#fff" })).toBeNull();
    expect(await repo.updateCustomization("u1", {})).toBeNull();
    expect(pool.query).not.toHaveBeenCalled();
  });

  it("builds update query with null-clearing fields", async () => {
    const pool = makePool();
    pool.query.mockResolvedValueOnce({ rows: [{ id: "u1" }] });
    const repo = createProfileCustomizationRepo(pool as never);

    const out = await repo.updateCustomization("u1", {
      bio: null,
      font: null,
      icon: null,
      color: "#111",
      border_color: "#222",
    });

    const [sql, values] = pool.query.mock.calls[0] as [string, unknown[]];
    expect(sql).toContain("update public.profile_customization");
    expect(sql).toContain("bio = $1");
    expect(sql).toContain("font = $4");
    expect(sql).toContain("icon = $5");
    expect(values).toEqual([null, "#111", "#222", null, null, "u1"]);
    expect(out).toEqual({ id: "u1" });
  });
});


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

  it("updates remaining color fields and keeps non-null bio/font/icon values", async () => {
    const pool = makePool();
    pool.query.mockResolvedValueOnce({ rows: [{ id: "u2" }] });
    const repo = createProfileCustomizationRepo(pool as never);

    const out = await repo.updateCustomization("u2", {
      bio: "About me",
      text_color: "#aaa",
      name_color: "#bbb",
      border: "1px solid #111",
      background: "radial-gradient(red, blue)",
      background_color: "#222",
      font: "Orbitron",
      icon: "star",
    });

    const [sql, values] = pool.query.mock.calls[0] as [string, unknown[]];
    expect(sql).toContain("text_color = $2");
    expect(sql).toContain("name_color = $3");
    expect(sql).toContain("border = $4");
    expect(sql).toContain("background = $5");
    expect(sql).toContain("background_color = $6");
    expect(values).toEqual([
      "About me",
      "#aaa",
      "#bbb",
      "1px solid #111",
      "radial-gradient(red, blue)",
      "#222",
      "Orbitron",
      "star",
      "u2",
    ]);
    expect(out).toEqual({ id: "u2" });
  });

  it("returns null when query returns no rows", async () => {
    const pool = makePool();
    pool.query.mockResolvedValueOnce({ rows: [] });
    const repo = createProfileCustomizationRepo(pool as never);

    await expect(repo.updateCustomization("u3", { color: "#123" })).resolves.toBeNull();
  });
});

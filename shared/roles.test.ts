import { describe, expect, it } from "vitest";
import { atLeast, isBanned, normalizeRole, rank } from "./roles.js";

describe("roles", () => {
  it("normalizeRole returns known role or default", () => {
    expect(normalizeRole("ADMIN")).toBe("admin");
    expect(normalizeRole("unknown-role")).toBe("default");
    expect(normalizeRole(undefined)).toBe("default");
  });

  it("isBanned narrows banned role", () => {
    expect(isBanned("banned")).toBe(true);
    expect(isBanned("admin")).toBe(false);
  });

  it("rank maps ladder roles in ascending order", () => {
    expect(rank("default")).toBeLessThan(rank("moderator"));
    expect(rank("moderator")).toBeLessThan(rank("creator"));
  });

  it("atLeast compares ladder roles and rejects banned", () => {
    expect(atLeast("admin", "moderator")).toBe(true);
    expect(atLeast("default", "admin")).toBe(false);
    expect(atLeast("banned", "default")).toBe(false);
  });
});


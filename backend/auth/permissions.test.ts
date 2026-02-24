import { describe, expect, it } from "vitest";
import { PERMS, PERM_RULES } from "./permissions.js";

describe("permissions", () => {
  it("has rules for all permissions", () => {
    for (const perm of PERMS) {
      expect(PERM_RULES[perm]).toBeTruthy();
    }
  });

  it("contains expected key permissions", () => {
    expect(PERMS).toContain("game:create");
    expect(PERMS).toContain("admin:panel");
    expect(PERMS).toContain("profiles:ban");
  });
});


import { describe, expect, it, vi } from "vitest";
import { PermissionManager } from "./permissionManager.js";
import { PERM_RULES } from "./permissions.js";
import type { WsLike } from "./wsTypes.js";

function makeWs(role: unknown = "default"): WsLike {
  return {
    auth: { isAuthed: true, userId: "u-1", role: role as never },
    send: vi.fn(),
  };
}

describe("PermissionManager", () => {
  it("allows and forbids based on minRole", () => {
    const pm = new PermissionManager();
    expect(pm.can(makeWs("default"), "game:create")).toBe(true);
    expect(pm.can(makeWs("default"), "admin:panel")).toBe(false);
  });

  it("rejects banned roles", () => {
    const pm = new PermissionManager();
    const decision = pm.decide(makeWs("banned"), "game:create");
    expect(decision.ok).toBe(false);
    expect(decision.reason).toBe("banned");
  });

  it("throws with code on require()", () => {
    const pm = new PermissionManager();
    expect(() => pm.require(makeWs("default"), "admin:panel")).toThrow("Forbidden: admin:panel");
    try {
      pm.require(makeWs("banned"), "game:create");
    } catch (e) {
      expect((e as Error & { code?: string }).code).toBe("BANNED");
    }
  });

  it("require() returns without throwing when allowed", () => {
    const pm = new PermissionManager();
    expect(() => pm.require(makeWs("default"), "game:create")).not.toThrow();
  });

  it("guard() emits an error payload when forbidden", () => {
    const pm = new PermissionManager();
    const ws = makeWs("default");
    expect(pm.guard(ws, "admin:panel")).toBe(false);
    expect(ws.send).toHaveBeenCalledWith(
      JSON.stringify({ type: "error", code: "forbidden", perm: "admin:panel" }),
    );
  });

  it("guard() returns true and does not send when allowed", () => {
    const pm = new PermissionManager();
    const ws = makeWs("default");
    expect(pm.guard(ws, "game:create")).toBe(true);
    expect(ws.send).not.toHaveBeenCalled();
  });

  it("uses custom rule when configured", () => {
    const pm = new PermissionManager();
    const original = PERM_RULES["game:create"];
    (PERM_RULES as unknown as Record<string, unknown>)["game:create"] = {
      custom: ({ data }: { data?: unknown }) => data === "ok",
    };

    expect(pm.can(makeWs("default"), "game:create", "ok")).toBe(true);
    expect(pm.can(makeWs("default"), "game:create", "nope")).toBe(false);

    (PERM_RULES as unknown as Record<string, unknown>)["game:create"] = original;
  });
});

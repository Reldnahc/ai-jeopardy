import { describe, expect, it, vi } from "vitest";
import {
  buildProfileRoleState,
  getNameHexForFontPreview,
  getSavedHexForTarget,
  loadProfileBoards,
} from "./profilePageController.helpers";

describe("profilePageController helpers", () => {
  it("normalizes saved hex values by target", () => {
    expect(getSavedHexForTarget({ color: " #ABCDEF " } as never, "color")).toBe("#abcdef");
  });

  it("builds moderation role state from viewer and target roles", () => {
    expect(
      buildProfileRoleState({
        viewerRank: 3,
        viewerRole: "admin",
        targetRoleRaw: "default",
      }),
    ).toMatchObject({
      canModerate: true,
      canPromote: true,
      canBan: true,
      canShowPromote: true,
      roleInfo: { label: "Player" },
    });
  });

  it("disables promotion for peers and banned targets", () => {
    expect(
      buildProfileRoleState({
        viewerRank: 1,
        viewerRole: "moderator",
        targetRoleRaw: "banned",
      }),
    ).toMatchObject({
      canModerate: true,
      canPromote: false,
      canBan: true,
    });
  });

  it("loads profile boards and surfaces request errors", async () => {
    const okFetch = vi.fn(async () => ({
      ok: true,
      json: async () => ({ boards: [{ id: 1 }] }),
    })) as unknown as typeof fetch;

    await expect(loadProfileBoards("Alice", okFetch)).resolves.toEqual({
      boards: [{ id: 1 }],
      error: null,
    });

    const badFetch = vi.fn(async () => ({
      ok: false,
      json: async () => ({ error: "boom" }),
    })) as unknown as typeof fetch;

    await expect(loadProfileBoards("Alice", badFetch)).resolves.toEqual({
      boards: [],
      error: "boom",
    });
  });

  it("returns the preview name color with the expected fallback", () => {
    expect(getNameHexForFontPreview(null)).toBe("#3b82f6");
    expect(getNameHexForFontPreview({ name_color: "#ABCDEF" } as never)).toBe("#abcdef");
  });
});

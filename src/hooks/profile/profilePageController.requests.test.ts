import { describe, expect, it, vi } from "vitest";
import {
  requestModeratedProfileUpdate,
  requestProfileCustomizationUpdate,
} from "./profilePageController.requests";

describe("profilePageController requests", () => {
  it("requests authenticated customization updates", async () => {
    const fetchImpl = vi.fn(async () => ({
      ok: true,
      json: async () => ({ profile: { username: "alice" } }),
    })) as unknown as typeof fetch;

    await expect(
      requestProfileCustomizationUpdate("tok", { bio: "Hello" }, fetchImpl),
    ).resolves.toEqual({
      profile: { username: "alice" },
    });

    expect(fetchImpl).toHaveBeenCalledWith(
      expect.stringContaining("/api/profile/me"),
      expect.objectContaining({
        method: "PATCH",
        headers: expect.objectContaining({ Authorization: "Bearer tok" }),
      }),
    );
  });

  it("requests moderated profile updates and surfaces errors", async () => {
    const okFetch = vi.fn(async () => ({
      ok: true,
      json: async () => ({ profile: { username: "alice" } }),
    })) as unknown as typeof fetch;

    await expect(
      requestModeratedProfileUpdate("tok", "alice", { role: "moderator" }, okFetch),
    ).resolves.toEqual({
      profile: { username: "alice" },
    });

    const badFetch = vi.fn(async () => ({
      ok: false,
      json: async () => ({ error: "boom" }),
    })) as unknown as typeof fetch;

    await expect(
      requestModeratedProfileUpdate("tok", "alice", { role: "moderator" }, badFetch),
    ).rejects.toThrow("boom");
  });
});

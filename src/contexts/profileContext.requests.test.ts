import { describe, expect, it, vi } from "vitest";
import {
  requestMeProfile,
  requestPublicProfile,
  requestPublicProfiles,
} from "./profileContext.requests.ts";

describe("profileContext request helpers", () => {
  it("requests a public profile and returns the parsed payload", async () => {
    const fetchImpl = vi.fn(async () => ({
      ok: true,
      json: async () => ({ profile: { username: "alice" } }),
    })) as unknown as typeof fetch;

    await expect(requestPublicProfile("alice", fetchImpl)).resolves.toEqual({
      username: "alice",
    });
  });

  it("requests public profile batches and propagates server errors", async () => {
    const okFetch = vi.fn(async () => ({
      ok: true,
      json: async () => ({ profiles: [{ username: "alice" }] }),
    })) as unknown as typeof fetch;

    await expect(requestPublicProfiles(["alice"], okFetch)).resolves.toEqual([
      { username: "alice" },
    ]);

    const badFetch = vi.fn(async () => ({
      ok: false,
      json: async () => ({ error: "boom" }),
    })) as unknown as typeof fetch;

    await expect(requestPublicProfiles(["alice"], badFetch)).rejects.toThrow("boom");
  });

  it("requests the authenticated profile with the bearer token", async () => {
    const fetchImpl = vi.fn(async () => ({
      ok: true,
      json: async () => ({ profile: { id: "u1" } }),
    })) as unknown as typeof fetch;

    await expect(requestMeProfile("tok", fetchImpl)).resolves.toEqual({ id: "u1" });
    expect(fetchImpl).toHaveBeenCalledWith(
      expect.stringContaining("/api/profile/me"),
      expect.objectContaining({
        headers: { Authorization: "Bearer tok" },
      }),
    );
  });
});

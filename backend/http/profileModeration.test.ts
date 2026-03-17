import { beforeEach, describe, expect, it, vi } from "vitest";

const { containsProfanity } = vi.hoisted(() => ({
  containsProfanity: vi.fn(() => false),
}));

vi.mock("../services/profanityService.js", () => ({
  containsProfanity,
}));

import {
  applyProfileModerationPatch,
  resolveProfileModerationAccess,
} from "./profileModeration.js";

function makeRepos() {
  const getRoleById = vi.fn(async (id: string): Promise<string | null> =>
    id === "actor" ? "admin" : "default",
  );

  return {
    profiles: {
      getPublicProfileByUsername: vi.fn(async () => ({ id: "target-1", username: "alice" })),
      getRoleById,
      updateCustomization: vi.fn(async () => ({})),
      setRoleById: vi.fn(async () => undefined),
    },
  };
}

describe("profileModeration helpers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    containsProfanity.mockReturnValue(false);
  });

  it("resolveProfileModerationAccess rejects banned and peer actors", async () => {
    const repos = makeRepos();
    repos.profiles.getRoleById.mockImplementation(async (id: string) =>
      id === "actor" ? "banned" : "default",
    );

    const banned = await resolveProfileModerationAccess({
      repos,
      actorId: "actor",
      username: "alice",
    });
    expect(banned).toEqual({ ok: false, status: 403, error: "Banned" });

    repos.profiles.getRoleById.mockImplementation(async () => "admin");
    const peer = await resolveProfileModerationAccess({
      repos,
      actorId: "actor",
      username: "alice",
    });
    expect(peer).toEqual({ ok: false, status: 403, error: "Cannot modify peer/superior" });
  });

  it("resolveProfileModerationAccess returns target id and actor rank for valid actors", async () => {
    const repos = makeRepos();

    const result = await resolveProfileModerationAccess({
      repos,
      actorId: "actor",
      username: "alice",
    });

    expect(result).toMatchObject({ ok: true, targetUserId: "target-1" });
  });

  it("applyProfileModerationPatch enforces bio permissions and profanity checks", async () => {
    const repos = makeRepos();

    const forbidden = await applyProfileModerationPatch({
      repos,
      targetUserId: "target-1",
      actorRank: 0,
      body: { bio: "clean" },
    });
    expect(forbidden).toEqual({ ok: false, status: 403, error: "Forbidden" });

    containsProfanity.mockReturnValueOnce(true);
    const profane = await applyProfileModerationPatch({
      repos,
      targetUserId: "target-1",
      actorRank: 1,
      body: { bio: "bad bio" },
    });
    expect(profane).toEqual({
      ok: false,
      status: 400,
      error: "Bio contains prohibited language.",
    });
  });

  it("applyProfileModerationPatch supports role updates and no-op bodies", async () => {
    const repos = makeRepos();

    const unchanged = await applyProfileModerationPatch({
      repos,
      targetUserId: "target-1",
      actorRank: 3,
      body: {},
    });
    expect(unchanged).toEqual({ ok: true, changed: false });

    const roleChanged = await applyProfileModerationPatch({
      repos,
      targetUserId: "target-1",
      actorRank: 3,
      body: { role: "moderator" },
    });
    expect(roleChanged).toEqual({ ok: true, changed: true });
    expect(repos.profiles.setRoleById).toHaveBeenCalledWith("target-1", "moderator");
  });
});

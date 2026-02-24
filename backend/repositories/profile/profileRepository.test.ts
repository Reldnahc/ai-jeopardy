import { describe, expect, it, vi } from "vitest";

const {
  createProfileAuthRepoMock,
  createProfileCustomizationRepoMock,
  createProfileLeaderboardRepoMock,
  createProfileReadRepoMock,
  createProfileRoleRepoMock,
  createProfileSearchRepoMock,
  createProfileStatsRepoMock,
} = vi.hoisted(() => ({
  createProfileAuthRepoMock: vi.fn(() => ({ authFn: true })),
  createProfileCustomizationRepoMock: vi.fn(() => ({ customizationFn: true })),
  createProfileLeaderboardRepoMock: vi.fn(() => ({ leaderboardFn: true })),
  createProfileReadRepoMock: vi.fn(() => ({ readFn: true })),
  createProfileRoleRepoMock: vi.fn(() => ({ roleFn: true })),
  createProfileSearchRepoMock: vi.fn(() => ({ searchFn: true })),
  createProfileStatsRepoMock: vi.fn(() => ({ statsFn: true })),
}));

vi.mock("./profile.auth.js", () => ({ createProfileAuthRepo: createProfileAuthRepoMock }));
vi.mock("./profile.customization.js", () => ({
  createProfileCustomizationRepo: createProfileCustomizationRepoMock,
}));
vi.mock("./profile.leaderboard.js", () => ({
  createProfileLeaderboardRepo: createProfileLeaderboardRepoMock,
}));
vi.mock("./profile.read.js", () => ({ createProfileReadRepo: createProfileReadRepoMock }));
vi.mock("./profile.role.js", () => ({ createProfileRoleRepo: createProfileRoleRepoMock }));
vi.mock("./profile.search.js", () => ({ createProfileSearchRepo: createProfileSearchRepoMock }));
vi.mock("./profile.stats.js", () => ({ createProfileStatsRepo: createProfileStatsRepoMock }));

import { createProfileRepository } from "./profileRepository.js";

describe("profileRepository", () => {
  it("throws when pool is missing", () => {
    expect(() => createProfileRepository(null as never)).toThrow("createProfileRepository: missing pool");
  });

  it("merges all profile repository modules", () => {
    const pool = {} as never;
    const repo = createProfileRepository(pool);

    expect(createProfileRoleRepoMock).toHaveBeenCalledWith(pool);
    expect(createProfileAuthRepoMock).toHaveBeenCalledWith(pool);
    expect(createProfileReadRepoMock).toHaveBeenCalledWith(pool);
    expect(createProfileSearchRepoMock).toHaveBeenCalledWith(pool);
    expect(createProfileCustomizationRepoMock).toHaveBeenCalledWith(pool);
    expect(createProfileLeaderboardRepoMock).toHaveBeenCalledWith(pool);
    expect(createProfileStatsRepoMock).toHaveBeenCalledWith(pool);
    expect(repo).toEqual({
      roleFn: true,
      authFn: true,
      readFn: true,
      searchFn: true,
      customizationFn: true,
      leaderboardFn: true,
      statsFn: true,
    });
  });
});


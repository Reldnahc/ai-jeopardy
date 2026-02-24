import { describe, expect, it, vi } from "vitest";

const {
  createProfileRepositoryMock,
  createBoardRepositoryMock,
  createImageAssetRepositoryMock,
  createTtsAssetRepositoryMock,
} = vi.hoisted(() => ({
  createProfileRepositoryMock: vi.fn(() => ({ kind: "profiles" })),
  createBoardRepositoryMock: vi.fn(() => ({ kind: "boards" })),
  createImageAssetRepositoryMock: vi.fn(() => ({ kind: "images" })),
  createTtsAssetRepositoryMock: vi.fn(() => ({ kind: "tts" })),
}));

vi.mock("./profile/profileRepository.js", () => ({
  createProfileRepository: createProfileRepositoryMock,
}));
vi.mock("./boardRepository.js", () => ({
  createBoardRepository: createBoardRepositoryMock,
}));
vi.mock("./imageAssetRepository.js", () => ({
  createImageAssetRepository: createImageAssetRepositoryMock,
}));
vi.mock("./ttsAssetRepository.js", () => ({
  createTtsAssetRepository: createTtsAssetRepositoryMock,
}));

import { createRepos } from "./index.js";

describe("repositories index", () => {
  it("throws when pool is missing", () => {
    expect(() => createRepos(null as never)).toThrow("createRepos: missing pool");
  });

  it("builds repositories from creator modules", () => {
    const pool = {} as never;
    const repos = createRepos(pool);

    expect(createProfileRepositoryMock).toHaveBeenCalledWith(pool);
    expect(createBoardRepositoryMock).toHaveBeenCalledWith(pool);
    expect(createImageAssetRepositoryMock).toHaveBeenCalledWith(pool);
    expect(createTtsAssetRepositoryMock).toHaveBeenCalledWith(pool);
    expect(repos).toEqual({
      profiles: { kind: "profiles" },
      boards: { kind: "boards" },
      images: { kind: "images" },
      tts: { kind: "tts" },
    });
  });
});


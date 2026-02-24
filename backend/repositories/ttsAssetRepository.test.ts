import { describe, expect, it, vi } from "vitest";
import { createTtsAssetRepository } from "./ttsAssetRepository.js";

function makePool() {
  return {
    query: vi.fn(),
  };
}

describe("ttsAssetRepository", () => {
  it("throws when pool is missing", () => {
    expect(() => createTtsAssetRepository(null as never)).toThrow("createTtsAssetRepository: missing pool");
  });

  it("returns null for empty query results", async () => {
    const pool = makePool();
    pool.query.mockResolvedValue({ rows: [] });
    const repo = createTtsAssetRepository(pool as never);

    await expect(repo.getBinaryById("a1")).resolves.toBeNull();
    await expect(repo.getMetaById("a1")).resolves.toBeNull();
    await expect(repo.getIdBySha256("h")).resolves.toBeNull();
    await expect(repo.getIdBySha256Provider("h", "openai")).resolves.toBeNull();
  });

  it("reads ids and upserts with explicit/default content type", async () => {
    const pool = makePool();
    pool.query
      .mockResolvedValueOnce({ rows: [{ id: "id-sha" }] })
      .mockResolvedValueOnce({ rows: [{ id: "id-sha-provider" }] })
      .mockResolvedValueOnce({ rows: [{ id: "id-upsert-1" }] })
      .mockResolvedValueOnce({ rows: [{ id: "id-upsert-2" }] });
    const repo = createTtsAssetRepository(pool as never);

    await expect(repo.getIdBySha256("h1")).resolves.toBe("id-sha");
    await expect(repo.getIdBySha256Provider("h2", "openai")).resolves.toBe("id-sha-provider");

    await expect(
      repo.upsertTtsAsset("h3", "openai", Buffer.from("a"), 1, "text", "clue", "v1", "tts", "en-US"),
    ).resolves.toBe("id-upsert-1");
    await expect(
      repo.upsertTtsAsset(
        "h4",
        "openai",
        Buffer.from("b"),
        2,
        "text2",
        "clue",
        "v2",
        "tts",
        "en-US",
        "audio/mpeg",
      ),
    ).resolves.toBe("id-upsert-2");

    expect(pool.query).toHaveBeenNthCalledWith(
      3,
      expect.stringContaining("insert into public.tts_assets"),
      ["h3", "openai", "audio/wav", Buffer.from("a"), 1, "text", "clue", "v1", "tts", "en-US"],
    );
    expect(pool.query).toHaveBeenNthCalledWith(
      4,
      expect.stringContaining("insert into public.tts_assets"),
      ["h4", "openai", "audio/mpeg", Buffer.from("b"), 2, "text2", "clue", "v2", "tts", "en-US"],
    );
  });
});


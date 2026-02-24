import { describe, expect, it, vi } from "vitest";
import { createImageAssetRepository } from "./imageAssetRepository.js";

function makePool() {
  return {
    query: vi.fn(),
  };
}

describe("imageAssetRepository", () => {
  it("throws when pool is missing", () => {
    expect(() => createImageAssetRepository(null as never)).toThrow(
      "createImageAssetRepository: missing pool",
    );
  });

  it("returns null when no rows found", async () => {
    const pool = makePool();
    pool.query.mockResolvedValue({ rows: [] });
    const repo = createImageAssetRepository(pool as never);

    await expect(repo.getImageBinaryById("a1")).resolves.toBeNull();
    await expect(repo.getImageMetaById("a1")).resolves.toBeNull();
    await expect(repo.getIdBySha256("h")).resolves.toBeNull();
  });

  it("returns rows and maps upsert args", async () => {
    const pool = makePool();
    pool.query
      .mockResolvedValueOnce({ rows: [{ data: Buffer.from("x"), bytes: 1, content_type: "image/webp" }] })
      .mockResolvedValueOnce({ rows: [{ storage_key: null, content_type: "image/webp" }] })
      .mockResolvedValueOnce({ rows: [{ id: "img1" }] })
      .mockResolvedValueOnce({ rows: [{ id: "img2" }] });
    const repo = createImageAssetRepository(pool as never);

    await expect(repo.getImageBinaryById("img1")).resolves.toEqual({
      data: Buffer.from("x"),
      bytes: 1,
      content_type: "image/webp",
    });
    await expect(repo.getImageMetaById("img1")).resolves.toEqual({
      storage_key: null,
      content_type: "image/webp",
    });
    await expect(repo.getIdBySha256("hash")).resolves.toBe("img1");
    await expect(
      repo.upsertImageAsset("hash2", Buffer.from("webp"), 4, undefined, undefined, undefined, undefined, undefined),
    ).resolves.toBe("img2");

    expect(pool.query).toHaveBeenLastCalledWith(
      expect.stringContaining("insert into public.image_assets"),
      ["hash2", Buffer.from("webp"), 4, null, null, null, null, null],
    );
  });
});


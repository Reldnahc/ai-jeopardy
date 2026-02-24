import { afterEach, describe, expect, it, vi } from "vitest";
import type { Ctx, Game } from "../../ws/context.types.js";
import { createCtx } from "../../test/createCtx.js";
import { aiHostSayAsset, aiHostSayByAsset, aiHostSayByKey } from "./playback.js";

function makeCtx(overrides: Partial<Ctx> = {}) {
  return {
    ctx: createCtx(
      {
        broadcast: vi.fn(),
        getTtsDurationMs: vi.fn(async () => 321),
      },
      overrides,
    ),
  };
}

describe("playback", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("aiHostSayAsset returns null when asset is missing", () => {
    const game = {} as unknown as Game;
    const { ctx } = makeCtx();

    const out = aiHostSayAsset(ctx, "g1", game, null);

    expect(out).toBeNull();
    expect(ctx.broadcast).not.toHaveBeenCalled();
  });

  it("aiHostSayAsset does not schedule clear timer for invalid duration", () => {
    const game = { aiHostPlayback: null } as unknown as Game;
    const { ctx } = makeCtx();

    aiHostSayAsset(ctx, "g1", game, "asset-1", -100);

    expect(game.aiHostPlayback?.durationMs).toBeNull();
    expect(game.aiHostPlayback?.endsAtMs).toBeNull();
    expect(game.aiHostPlayback?.clearTimer).toBeNull();
  });

  it("aiHostSayAsset clears playback after duration with grace window", () => {
    vi.useFakeTimers();
    const game = { aiHostPlayback: null } as unknown as Game;
    const { ctx } = makeCtx();

    aiHostSayAsset(ctx, "g1", game, "asset-1", 100);
    expect(game.aiHostPlayback?.assetId).toBe("asset-1");

    vi.advanceTimersByTime(349);
    expect(game.aiHostPlayback?.assetId).toBe("asset-1");

    vi.advanceTimersByTime(1);
    expect(game.aiHostPlayback).toBeNull();
  });

  it("aiHostSayByAsset uses timeout fallback when duration lookup stalls", async () => {
    vi.useFakeTimers();
    const game = {} as unknown as Game;
    const { ctx } = makeCtx({
      getTtsDurationMs: vi.fn(
        () =>
          new Promise<number>(() => {
            // never resolves
          }),
      ),
    });

    const p = aiHostSayByAsset(ctx, "g1", game, "asset-timeout");
    await vi.advanceTimersByTimeAsync(1000);
    const out = await p;

    expect(out).toEqual({ assetId: "asset-timeout", ms: 0 });
    expect(ctx.broadcast).toHaveBeenCalledWith(
      "g1",
      expect.objectContaining({ assetId: "asset-timeout", durationMs: undefined }),
    );
  });

  it("aiHostSayByKey resolves player/category/value/final keys", async () => {
    const game = {
      aiHostTts: {
        nameAssetsByPlayer: { Alice: "name-1" },
        categoryAssetsByCategory: { Science: "cat-1" },
        valueAssetsByValue: { 400: "val-1" },
        finalJeopardyAnswersByPlayer: { fjaAlice: "fja-1" },
        finalJeopardyWagersByPlayer: { fjwAlice: "fjw-1" },
        slotAssets: {},
      },
    } as unknown as Game;
    const { ctx } = makeCtx();

    await expect(aiHostSayByKey(ctx, "g1", game, "Alice")).resolves.toEqual({
      assetId: "name-1",
      ms: 321,
    });
    await expect(aiHostSayByKey(ctx, "g1", game, "Science")).resolves.toEqual({
      assetId: "cat-1",
      ms: 321,
    });
    await expect(aiHostSayByKey(ctx, "g1", game, "400")).resolves.toEqual({
      assetId: "val-1",
      ms: 321,
    });
    await expect(aiHostSayByKey(ctx, "g1", game, "fjaAlice")).resolves.toEqual({
      assetId: "fja-1",
      ms: 321,
    });
    await expect(aiHostSayByKey(ctx, "g1", game, "fjwAlice")).resolves.toEqual({
      assetId: "fjw-1",
      ms: 321,
    });
  });

  it("aiHostSayByKey returns null for empty key or unresolved key", async () => {
    const game = { aiHostTts: { slotAssets: {} } } as unknown as Game;
    const { ctx } = makeCtx();

    await expect(aiHostSayByKey(ctx, "g1", game, "")).resolves.toBeNull();
    await expect(aiHostSayByKey(ctx, "g1", game, "missing")).resolves.toBeNull();
  });
});

import { describe, expect, it, vi } from "vitest";
import type { Ctx, Game } from "../../ws/context.types.js";
import { createCtx } from "../../test/createCtx.js";
import { aiHostVoiceSequence } from "./sequence.js";
import * as playback from "./playback.js";

vi.mock("./playback.js", () => ({
  aiHostSayByAsset: vi.fn(),
  aiHostSayByKey: vi.fn(),
}));

function makeCtx(overrides: Partial<Ctx> = {}) {
  return {
    ctx: createCtx(
      {
        sleepAndCheckGame: vi.fn(async () => true),
      },
      overrides,
    ),
  };
}

describe("sequence", () => {
  it("runs slot and asset steps, sleeps with pad, and executes callbacks", async () => {
    const game = {} as unknown as Game;
    const { ctx } = makeCtx();
    const afterA = vi.fn();
    const afterB = vi.fn();

    vi.mocked(playback.aiHostSayByKey).mockResolvedValueOnce({ assetId: "k1", ms: 200 });
    vi.mocked(playback.aiHostSayByAsset).mockResolvedValueOnce({ assetId: "a1", ms: 300 });

    const alive = await aiHostVoiceSequence(ctx, "g1", game, [
      { slot: "correct", pad: 50, after: afterA },
      { assetId: "asset-1", after: afterB },
    ]);

    expect(alive).toBe(true);
    expect(playback.aiHostSayByKey).toHaveBeenCalledWith(ctx, "g1", game, "correct");
    expect(playback.aiHostSayByAsset).toHaveBeenCalledWith(ctx, "g1", game, "asset-1");
    expect(ctx.sleepAndCheckGame).toHaveBeenNthCalledWith(1, 250, "g1");
    expect(ctx.sleepAndCheckGame).toHaveBeenNthCalledWith(2, 300, "g1");
    expect(afterA).toHaveBeenCalledTimes(1);
    expect(afterB).toHaveBeenCalledTimes(1);
  });

  it("returns false when game dies before callback", async () => {
    const game = {} as unknown as Game;
    const after = vi.fn();
    const { ctx } = makeCtx({ sleepAndCheckGame: vi.fn(async () => false) });

    vi.mocked(playback.aiHostSayByKey).mockResolvedValueOnce({ assetId: "k1", ms: 200 });

    const alive = await aiHostVoiceSequence(ctx, "g1", game, [{ slot: "correct", after }]);

    expect(alive).toBe(false);
    expect(after).not.toHaveBeenCalled();
  });

  it("treats null playback result as zero-delay step", async () => {
    const game = {} as unknown as Game;
    const { ctx } = makeCtx();

    vi.mocked(playback.aiHostSayByAsset).mockResolvedValueOnce(null);

    const alive = await aiHostVoiceSequence(ctx, "g1", game, [{ assetId: "missing-asset" }]);

    expect(alive).toBe(true);
    expect(ctx.sleepAndCheckGame).toHaveBeenCalledWith(0, "g1");
  });
});

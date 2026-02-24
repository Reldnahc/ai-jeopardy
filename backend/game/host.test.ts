import { describe, expect, it, vi } from "vitest";
import type { Ctx, Game } from "../ws/context.types.js";
import {
  aiHostSayAsset,
  aiHostSayByKey,
  aiHostVoiceSequence,
  ensureAiHostTtsBank,
  ensureAiHostValueTts,
} from "./host.js";

function makeCtx(overrides: Partial<Ctx> = {}) {
  let idSeq = 0;
  const ctx = {
    repos: {},
    ensureTtsAsset: vi.fn(async ({ text }: { text: string }) => {
      idSeq += 1;
      const safe = String(text).replace(/\s+/g, "_").toLowerCase();
      return { id: `tts-${safe}-${idSeq}` };
    }),
    broadcast: vi.fn(),
    getTtsDurationMs: vi.fn(async () => 321),
    sleepAndCheckGame: vi.fn(async () => true),
  } as unknown as Ctx;

  return { ctx: { ...ctx, ...overrides } as Ctx };
}

describe("host", () => {
  it("ensureAiHostValueTts creates value assets once per unique positive value", async () => {
    const game = {
      lobbySettings: { narrationEnabled: true },
      ttsProvider: "voice-1",
      boardData: {
        firstBoard: {
          categories: [{ values: [{ value: 200 }, { value: 400 }] }],
        },
        secondBoard: {
          categories: [{ values: [{ value: 400 }, { value: 800 }, { value: 0 }] }],
        },
      },
      aiHostTts: {
        slotAssets: {},
        nameAssetsByPlayer: {},
        categoryAssetsByCategory: {},
        valueAssetsByValue: {},
        finalJeopardyAnswersByPlayer: {},
        finalJeopardyWagersByPlayer: {},
        allAssetIds: [],
      },
    } as unknown as Game;

    const { ctx } = makeCtx();

    await ensureAiHostValueTts({ ctx, game });

    expect(ctx.ensureTtsAsset).toHaveBeenCalledTimes(3);
    expect(Object.keys(game.aiHostTts?.valueAssetsByValue || {}).sort()).toEqual(["200", "400", "800"]);
  });

  it("ensureAiHostTtsBank no-ops when narration disabled", async () => {
    const game = {
      lobbySettings: { narrationEnabled: false },
      players: [{ displayname: "Alice" }],
      categories: ["Science"],
    } as unknown as Game;

    const { ctx } = makeCtx();

    await ensureAiHostTtsBank({ ctx, game });

    expect(game.aiHostTts?.allAssetIds).toEqual([]);
    expect(ctx.ensureTtsAsset).not.toHaveBeenCalled();
  });

  it("aiHostSayAsset updates playback and broadcasts", () => {
    const game = { aiHostPlayback: null } as unknown as Game;
    const { ctx } = makeCtx();

    const id = aiHostSayAsset(ctx, "g1", game, "asset-1", 500);

    expect(id).toBe("asset-1");
    expect(game.aiHostPlayback?.assetId).toBe("asset-1");
    expect(ctx.broadcast).toHaveBeenCalledWith(
      "g1",
      expect.objectContaining({ type: "ai-host-say", assetId: "asset-1", durationMs: 500 }),
    );
  });

  it("aiHostSayByKey resolves key and uses measured duration", async () => {
    const game = {
      aiHostTts: {
        slotAssets: { correct: ["asset-a", "asset-b"] },
      },
    } as unknown as Game;

    const { ctx } = makeCtx();
    const randomSpy = vi.spyOn(Math, "random").mockReturnValue(0);

    const out = await aiHostSayByKey(ctx, "g1", game, "correct");

    expect(out).toEqual({ assetId: "asset-a", ms: 321 });
    expect(ctx.broadcast).toHaveBeenCalledWith(
      "g1",
      expect.objectContaining({ type: "ai-host-say", assetId: "asset-a", durationMs: 321 }),
    );

    randomSpy.mockRestore();
  });

  it("aiHostVoiceSequence stops early when game is no longer alive", async () => {
    const game = {
      aiHostTts: {
        slotAssets: { correct: ["asset-a"] },
      },
    } as unknown as Game;

    const afterSpy = vi.fn();
    const { ctx } = makeCtx({ sleepAndCheckGame: vi.fn(async () => false) });

    const alive = await aiHostVoiceSequence(ctx, "g1", game, [
      { slot: "correct", after: afterSpy },
      { slot: "correct" },
    ]);

    expect(alive).toBe(false);
    expect(afterSpy).not.toHaveBeenCalled();
  });
});

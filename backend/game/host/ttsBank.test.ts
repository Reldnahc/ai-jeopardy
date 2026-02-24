import { describe, expect, it, vi } from "vitest";
import type { Ctx, Game, Trace } from "../../ws/context.types.js";
import { createCtx } from "../../test/createCtx.js";
import { AI_HOST_VARIANTS } from "./variants.js";
import {
  ensureAiHostTtsBank,
  ensureAiHostValueTts,
  ensureFinalJeopardyAnswer,
  ensureFinalJeopardyWager,
} from "./ttsBank.js";

function makeCtx(overrides: Partial<Ctx> = {}) {
  let seq = 0;
  return {
    ctx: createCtx(
      {
        repos: {},
        ensureTtsAsset: vi.fn(async () => {
          seq += 1;
          return { id: `asset-${seq}` };
        }),
        numberToWords: vi.fn((n: number) => `${n} words`),
        broadcast: vi.fn(),
      },
      overrides,
    ),
  };
}

describe("ttsBank", () => {
  it("ensureAiHostTtsBank returns early when bank already exists", async () => {
    const game = {
      lobbySettings: { narrationEnabled: true },
      aiHostTts: { allAssetIds: [] },
    } as unknown as Game;
    const { ctx } = makeCtx();

    await ensureAiHostTtsBank({ ctx, game });

    expect(ctx.ensureTtsAsset).not.toHaveBeenCalled();
  });

  it("ensureAiHostTtsBank builds slot/name/category assets and marks trace", async () => {
    const trace = { mark: vi.fn() } as unknown as Trace;
    const game = {
      lobbySettings: { narrationEnabled: true },
      ttsProvider: "voice-1",
      players: [{ displayname: "Alice" }, { displayname: " " }],
      categories: ["Science", { category: "History" }, { name: "Art" }, { category: "  " }],
    } as unknown as Game;
    const { ctx } = makeCtx();

    await ensureAiHostTtsBank({ ctx, game, trace });

    const variantCount = Object.values(AI_HOST_VARIANTS).reduce((sum, list) => sum + list.length, 0);
    expect(ctx.ensureTtsAsset).toHaveBeenCalledTimes(variantCount + 1 + 3);
    expect(game.aiHostTts?.nameAssetsByPlayer?.Alice).toBeTruthy();
    expect(Object.keys(game.aiHostTts?.categoryAssetsByCategory || {}).sort()).toEqual([
      "Art",
      "History",
      "Science",
    ]);
    expect(game.aiHostTts?.allAssetIds?.length).toBe(variantCount + 4);
    expect(trace.mark).toHaveBeenCalledWith("tts_ensure_aihost_start");
    expect(trace.mark).toHaveBeenCalledWith(
      "tts_ensure_aihost_end",
      expect.objectContaining({
        total: variantCount + 4,
        names: 1,
        categories: 3,
      }),
    );
  });

  it("ensureAiHostValueTts populates only missing values and emits end mark", async () => {
    const trace = { mark: vi.fn() } as unknown as Trace;
    const game = {
      lobbySettings: { narrationEnabled: true },
      ttsProvider: "voice-1",
      boardData: {
        firstBoard: {
          categories: [{ values: [{ value: 200 }, { value: 400 }, { value: 0 }] }],
        },
        secondBoard: {
          categories: [{ values: [{ value: 400 }, { value: 800 }] }],
        },
      },
      aiHostTts: {
        slotAssets: {},
        nameAssetsByPlayer: {},
        categoryAssetsByCategory: {},
        valueAssetsByValue: { 400: "existing-400" },
        finalJeopardyAnswersByPlayer: {},
        finalJeopardyWagersByPlayer: {},
        allAssetIds: ["existing-400"],
      },
    } as unknown as Game;
    const { ctx } = makeCtx();

    await ensureAiHostValueTts({ ctx, game, trace });

    expect(ctx.ensureTtsAsset).toHaveBeenCalledTimes(2);
    expect(game.aiHostTts?.valueAssetsByValue).toMatchObject({
      200: "asset-1",
      400: "existing-400",
      800: "asset-2",
    });
    expect(game.aiHostTts?.allAssetIds?.sort()).toEqual(["asset-1", "asset-2", "existing-400"]);
    expect(trace.mark).toHaveBeenCalledWith(
      "tts_ensure_aihost_values_end",
      expect.objectContaining({ values: 3, total: 3 }),
    );
  });

  it("ensureFinalJeopardyAnswer and ensureFinalJeopardyWager store assets and broadcast preload", async () => {
    const game = {
      aiHostTts: {
        finalJeopardyAnswersByPlayer: {},
        finalJeopardyWagersByPlayer: {},
        allAssetIds: [],
      },
    } as unknown as Game;
    const { ctx } = makeCtx();

    await ensureFinalJeopardyAnswer(ctx, game, "g1", "Alice", "What is test?");
    await ensureFinalJeopardyWager(ctx, game, "g1", "Alice", 700);

    expect(game.aiHostTts?.finalJeopardyAnswersByPlayer?.fjaAlice).toBe("asset-1");
    expect(game.aiHostTts?.finalJeopardyWagersByPlayer?.fjwAlice).toBe("asset-2");
    expect(game.aiHostTts?.allAssetIds).toEqual(["asset-1", "asset-2"]);
    expect(ctx.numberToWords).toHaveBeenCalledWith(700);
    expect(ctx.broadcast).toHaveBeenNthCalledWith(1, "g1", {
      type: "preload-final-jeopardy-asset",
      assetId: "asset-1",
    });
    expect(ctx.broadcast).toHaveBeenNthCalledWith(2, "g1", {
      type: "preload-final-jeopardy-asset",
      assetId: "asset-2",
    });
  });
});

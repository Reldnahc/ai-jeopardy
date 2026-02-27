import type { Trace, AiHostTtsBank, Game, CtxDeps } from "../../ws/context.types.js";
import { AI_HOST_VARIANTS, collectBoardValues, nameCalloutText } from "./variants.js";

export type HostTtsCtx = CtxDeps<"ensureTtsAsset" | "repos" | "broadcast" | "numberToWords">;
const DEFAULT_HOST_VOICE = "kokoro:af_heart";
const OPENAI_HOST_VOICE_FAST = "openai:alloy@1.25";

function hostVoiceFromLobby(game: Game): string {
  const provider = String(game?.lobbySettings?.ttsProviderName ?? "kokoro").trim().toLowerCase();
  return provider === "openai" ? OPENAI_HOST_VOICE_FAST : DEFAULT_HOST_VOICE;
}

async function ensureHostTtsAsset(ctx: HostTtsCtx, game: Game, text: string) {
  const provider = String(game?.lobbySettings?.ttsProviderName ?? "kokoro").trim().toLowerCase();
  return ctx.ensureTtsAsset(
    {
      text,
      voiceId: hostVoiceFromLobby(game),
      outputFormat: provider === "openai" ? "mp3" : "wav",
    },
    ctx.repos,
  );
}

export async function ensureAiHostValueTts(opts: {
  ctx: HostTtsCtx;
  game: Game;
  trace?: Trace;
}): Promise<void> {
  const { ctx, game, trace } = opts;

  if (!game) return;

  const narrationEnabled = Boolean(game?.lobbySettings?.narrationEnabled);
  if (!narrationEnabled) return;

  if (!game.aiHostTts || !Array.isArray(game.aiHostTts.allAssetIds)) {
    game.aiHostTts = {
      slotAssets: {},
      nameAssetsByPlayer: {},
      categoryAssetsByCategory: {},
      valueAssetsByValue: {},
      finalJeopardyAnswersByPlayer: {},
      finalJeopardyWagersByPlayer: {},
      allAssetIds: [],
    };
  }

  const tts = game.aiHostTts;

  const values = collectBoardValues(game);
  if (values.length === 0) return;

  tts.valueAssetsByValue = tts.valueAssetsByValue || {};

  const jobs: Array<Promise<void>> = [];

  for (const v of values) {
    const k = String(v);

    if (tts.valueAssetsByValue[k]) continue;

    jobs.push(
      (async () => {
        const asset = await ensureHostTtsAsset(ctx, game, `For ${v} dollars.`);

        tts.valueAssetsByValue[k] = asset.id;
        tts.allAssetIds.push(asset.id);
      })(),
    );
  }

  await Promise.all(jobs);

  tts.allAssetIds = Array.from(new Set(tts.allAssetIds));

  trace?.mark?.("tts_ensure_aihost_values_end", {
    values: Object.keys(tts.valueAssetsByValue).length,
    total: tts.allAssetIds.length,
  });
}

export async function ensureFinalJeopardyAnswer(
  ctx: HostTtsCtx,
  game: Game,
  gameId: string,
  playerName: string,
  text: string,
): Promise<void> {
  const tts = game.aiHostTts;
  const asset = await ensureHostTtsAsset(ctx, game, text);

  tts.finalJeopardyAnswersByPlayer["fja" + playerName] = asset.id;
  tts.allAssetIds.push(asset.id);

  ctx.broadcast(gameId, { type: "preload-final-jeopardy-asset", assetId: asset.id });
}

export async function ensureFinalJeopardyWager(
  ctx: HostTtsCtx,
  game: Game,
  gameId: string,
  playerName: string,
  wager: number,
): Promise<void> {
  const tts = game.aiHostTts;
  const asset = await ensureHostTtsAsset(ctx, game, ctx.numberToWords(wager));

  tts.finalJeopardyWagersByPlayer["fjw" + playerName] = asset.id;
  tts.allAssetIds.push(asset.id);

  ctx.broadcast(gameId, { type: "preload-final-jeopardy-asset", assetId: asset.id });
}

export async function ensureAiHostTtsBank(opts: {
  ctx: HostTtsCtx;
  game: Game;
  trace?: Trace;
}): Promise<void> {
  const { ctx, game, trace } = opts;

  if (!game) return;
  if (game.aiHostTts && Array.isArray(game.aiHostTts.allAssetIds)) return;

  const narrationEnabled = Boolean(game?.lobbySettings?.narrationEnabled);
  if (!narrationEnabled) {
    game.aiHostTts = {
      slotAssets: {},
      nameAssetsByPlayer: {},
      categoryAssetsByCategory: {},
      valueAssetsByValue: {},
      finalJeopardyAnswersByPlayer: {},
      finalJeopardyWagersByPlayer: {},
      allAssetIds: [],
    };
    return;
  }

  const slotKeys = Object.keys(AI_HOST_VARIANTS);

  const out: AiHostTtsBank = {
    slotAssets: {},
    nameAssetsByPlayer: {},
    categoryAssetsByCategory: {},
    valueAssetsByValue: {},
    finalJeopardyAnswersByPlayer: {},
    finalJeopardyWagersByPlayer: {},
    allAssetIds: [],
  };

  for (const k of slotKeys) out.slotAssets[k] = [];

  trace?.mark?.("tts_ensure_aihost_start");

  const slotJobs: Array<Promise<void>> = [];

  for (const slot of slotKeys) {
    const variants = AI_HOST_VARIANTS[slot] || [];
    for (const text of variants) {
      slotJobs.push(
        (async () => {
          const asset = await ensureHostTtsAsset(ctx, game, text);

          out.slotAssets[slot].push(asset.id);
          out.allAssetIds.push(asset.id);
        })(),
      );
    }
  }

  const players = Array.isArray(game.players) ? game.players : [];
  for (const p of players) {
    const name = String(p?.displayname || "").trim();
    if (!name) continue;

    slotJobs.push(
      (async () => {
        const asset = await ensureHostTtsAsset(ctx, game, nameCalloutText(name));

        out.nameAssetsByPlayer[name] = asset.id;
        out.allAssetIds.push(asset.id);
      })(),
    );
  }

  const categories = Array.isArray(game.categories) ? game.categories : [];
  for (const c of categories) {
    const categoryName =
      typeof c === "string" ? c.trim() : String(c?.name || c?.category || "").trim();

    if (!categoryName) continue;

    slotJobs.push(
      (async () => {
        const asset = await ensureHostTtsAsset(ctx, game, categoryName);

        out.categoryAssetsByCategory[categoryName] = asset.id;
        out.allAssetIds.push(asset.id);
      })(),
    );
  }

  await Promise.all(slotJobs);

  out.allAssetIds = Array.from(new Set(out.allAssetIds));
  game.aiHostTts = out;

  trace?.mark?.("tts_ensure_aihost_end", {
    total: out.allAssetIds.length,
    slots: slotKeys.reduce<Record<string, number>>((acc, k) => {
      acc[k] = out.slotAssets[k]?.length ?? 0;
      return acc;
    }, {}),
    names: Object.keys(out.nameAssetsByPlayer).length,
    categories: Object.keys(out.categoryAssetsByCategory).length,
  });
}

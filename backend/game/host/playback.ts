import type { CtxDeps, Game } from "../../ws/context.types.js";

export type HostPlaybackCtx = CtxDeps<"broadcast" | "getTtsDurationMs">;

const AI_HOST_PLAYBACK_GRACE_MS = 250;

function clearAiHostPlaybackTimer(game: Game) {
  const timer = game.aiHostPlayback?.clearTimer;
  if (timer) clearTimeout(timer);
}

export function aiHostSayAsset(
  ctx: HostPlaybackCtx,
  gameId: string,
  game: Game,
  assetId: string | null | undefined,
  durationMsRaw?: number | null,
): string | null {
  if (!assetId) return null;

  clearAiHostPlaybackTimer(game);

  const startedAtMs = Date.now();
  const durationMs =
    typeof durationMsRaw === "number" && Number.isFinite(durationMsRaw) && durationMsRaw > 0
      ? Math.round(durationMsRaw)
      : null;

  const nextPlayback = {
    assetId,
    startedAtMs,
    durationMs,
    endsAtMs: durationMs ? startedAtMs + durationMs : null,
    clearTimer: null as ReturnType<typeof setTimeout> | null,
  };

  if (durationMs) {
    nextPlayback.clearTimer = setTimeout(() => {
      if (
        game.aiHostPlayback?.assetId === assetId &&
        game.aiHostPlayback?.startedAtMs === startedAtMs
      ) {
        game.aiHostPlayback = null;
      }
    }, durationMs + AI_HOST_PLAYBACK_GRACE_MS);
  }

  game.aiHostPlayback = nextPlayback;

  ctx.broadcast(gameId, {
    type: "ai-host-say",
    assetId,
    startedAtMs,
    durationMs: durationMs ?? undefined,
  });
  return assetId;
}

const withTimeout = async <T>(p: Promise<T>, ms: number, fallback: T): Promise<T> => {
  let t: ReturnType<typeof setTimeout> | null = null;

  const timeout = new Promise<T>((resolve) => {
    t = setTimeout(() => resolve(fallback), ms);
  });

  try {
    return await Promise.race([p, timeout]);
  } finally {
    if (t) clearTimeout(t);
  }
};

export async function aiHostSayByAsset(
  ctx: HostPlaybackCtx,
  gameId: string,
  game: Game,
  assetId: string,
): Promise<{ assetId: string; ms: number } | null> {
  if (!assetId) return null;

  const ms = await withTimeout(ctx.getTtsDurationMs(assetId), 1000, 0);
  aiHostSayAsset(ctx, gameId, game, assetId, ms);
  return { assetId, ms: Number(ms) || 0 };
}

export async function aiHostSayByKey(
  ctx: HostPlaybackCtx,
  gameId: string,
  game: Game,
  key: string,
): Promise<{ assetId: string; ms: number } | null> {
  if (!key) return null;

  const tts = game?.aiHostTts;
  if (!tts) return null;

  const resolved: string | string[] | null =
    tts.nameAssetsByPlayer?.[key] ||
    tts.categoryAssetsByCategory?.[key] ||
    tts.valueAssetsByValue?.[key] ||
    tts.finalJeopardyAnswersByPlayer?.[key] ||
    tts.finalJeopardyWagersByPlayer?.[key] ||
    tts.slotAssets?.[key] ||
    null;

  if (!resolved) return null;

  const assetId = Array.isArray(resolved)
    ? resolved[Math.floor(Math.random() * resolved.length)]
    : resolved;

  if (!assetId) return null;

  const ms = await withTimeout(ctx.getTtsDurationMs(assetId), 1000, 0);
  aiHostSayAsset(ctx, gameId, game, assetId, ms);
  return { assetId, ms: Number(ms) || 0 };
}

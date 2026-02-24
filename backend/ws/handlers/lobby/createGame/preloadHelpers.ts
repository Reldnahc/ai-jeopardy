import type { GameState, PlayerState } from "../../../../types/runtime.js";
import type { Ctx } from "../../../context.types.js";

type TraceLike = { mark: (name: string, data?: Record<string, unknown>) => void } | null;

export function initPreloadState({
  ctx,
  gameId,
  game,
  trace,
}: {
  ctx: Ctx;
  gameId: string;
  game: GameState | null | undefined;
  trace?: TraceLike;
}) {
  if (!game) return null;

  const onlinePlayers = (game.players ?? []).filter((p: PlayerState) => p.online);

  game.preload = {
    active: true,
    required: onlinePlayers.map(ctx.playerStableId),
    token: 0,
    finalToken: null,
    acksByPlayer: {},
    createdAt: Date.now(),
  };

  trace?.mark?.("preload_state_initialized", {
    requiredPlayers: game.preload.required?.length ?? 0,
    requiredPlayerIds: game.preload.required ?? [],
  });

  if ((game.preload.required?.length ?? 0) === 0) {
    trace?.mark?.("preload_no_required_players");
    return game.preload;
  }

  ctx.broadcast(gameId, { type: "preload-start", token: game.preload.token });
  return game.preload;
}

export function broadcastPreloadBatch({
  ctx,
  gameId,
  game,
  imageAssetIds = [],
  ttsAssetIds = [],
  final = false,
  trace,
  reason,
}: {
  ctx: Ctx;
  gameId: string;
  game: GameState;
  imageAssetIds?: string[];
  ttsAssetIds?: string[];
  final?: boolean;
  trace?: TraceLike;
  reason?: string;
}) {
  if (!game?.preload?.active) return null;

  const images = Array.isArray(imageAssetIds) ? imageAssetIds.filter(Boolean) : [];
  const tts = Array.isArray(ttsAssetIds) ? ttsAssetIds.filter(Boolean) : [];

  game.preload.token = (Number(game.preload.token) || 0) + 1;
  const token = game.preload.token;
  if (final) game.preload.finalToken = token;

  trace?.mark?.("preload_broadcast_batch", {
    token,
    final,
    reason: reason || null,
    batchImages: images.length,
    batchTts: tts.length,
  });

  ctx.broadcast(gameId, {
    type: "preload-assets",
    token,
    final,
    imageAssetIds: images,
    ttsAssetIds: tts,
  });

  ctx.broadcast(gameId, {
    type: "preload-images",
    assetIds: images,
    ttsAssetIds: tts,
    token,
    final,
  });

  return token;
}

export async function setupPreloadHandshake({
  ctx,
  gameId,
  game,
  boardData,
  trace,
}: {
  ctx: Ctx;
  gameId: string;
  game: GameState;
  boardData: GameState["boardData"];
  trace?: TraceLike;
}) {
  trace?.mark?.("preload_handshake_start", {
    gameId,
    narrationEnabled: Boolean(game?.lobbySettings?.narrationEnabled),
  });

  if (!game?.preload?.active) {
    initPreloadState({ ctx, gameId, game, trace });
  }

  const imageAssetIds = ctx.collectImageAssetIdsFromBoard(boardData);
  const baseTts = Array.isArray(boardData?.ttsAssetIds) ? boardData.ttsAssetIds : [];
  const aiHostExtra = Array.isArray(game?.aiHostTts?.allAssetIds) ? game.aiHostTts.allAssetIds : [];
  const ttsAssetIds = Array.from(new Set([...baseTts, ...aiHostExtra]));

  broadcastPreloadBatch({
    ctx,
    gameId,
    game,
    imageAssetIds,
    ttsAssetIds,
    final: true,
    trace,
    reason: "board+aihost-final",
  });

  trace?.mark?.("preload_handshake_end", {
    finalToken: game?.preload?.finalToken ?? null,
    imageAssetCount: imageAssetIds.length,
    ttsAssetCount: ttsAssetIds.length,
  });

  return { imageAssetIds, ttsAssetIds };
}

import type { GameState } from "../../../../types/runtime.js";
import type { Ctx } from "../../../context.types.js";
import { broadcastPreloadBatch } from "./preloadHelpers.js";

type TraceLike = { mark: (name: string, data?: Record<string, unknown>) => void } | null;

function makePreloadTtsBatcher({
  ctx,
  gameId,
  game,
  flushMs = 250,
  maxBatch = 12,
  trace,
}: {
  ctx: Ctx;
  gameId: string;
  game: GameState;
  flushMs?: number;
  maxBatch?: number;
  trace?: TraceLike;
}) {
  let buf: string[] = [];
  let timer: NodeJS.Timeout | null = null;

  const flush = () => {
    timer = null;
    if (buf.length === 0) return;
    const batch = buf;
    buf = [];

    broadcastPreloadBatch({
      ctx,
      gameId,
      game,
      imageAssetIds: [],
      ttsAssetIds: batch,
      final: false,
      trace,
      reason: "board-tts-partial",
    });
  };

  return {
    push(id: string) {
      const v = String(id ?? "").trim();
      if (!v) return;
      buf.push(v);
      if (buf.length >= maxBatch) {
        flush();
        return;
      }
      if (!timer) timer = setTimeout(flush, flushMs);
    },
    flush,
  };
}

export function resetGenerationProgressAndNotify({
  ctx,
  gameId,
  game,
}: {
  ctx: Ctx;
  gameId: string;
  game: GameState;
}) {
  ctx.broadcast(gameId, { type: "trigger-loading" });

  game.generationDone = 0;
  game.generationTotal = 0;
  game.generationProgress = 0;

  ctx.broadcast(gameId, {
    type: "generation-progress",
    progress: 0,
    done: 0,
    total: 0,
  });
}

export function clearGenerationProgress(game: GameState) {
  game.generationDone = null;
  game.generationTotal = null;
  game.generationProgress = null;
}

export function safeAbortGeneration(game: GameState) {
  game.isGenerating = false;
  clearGenerationProgress(game);
}

export function applyNewGameState({
  game,
  boardData,
  timeToBuzz,
  timeToAnswer,
  usingImportedBoard,
}: {
  game: GameState;
  boardData: GameState["boardData"];
  timeToBuzz: number;
  timeToAnswer: number;
  usingImportedBoard: boolean;
}) {
  game.buzzed = null;
  game.buzzerLocked = true;
  game.buzzLockouts = {};
  game.clearedClues = new Set();
  game.boardData = boardData;
  game.scores = {};
  game.isLoading = true;
  game.timeToBuzz = timeToBuzz;
  game.timeToAnswer = timeToAnswer;
  game.isImportedBoardGame = Boolean(usingImportedBoard);
  game.isGenerating = false;
  game.activeBoard = "firstBoard";
  game.isFinalJeopardy = false;
  game.finalJeopardyStage = null;
}

export async function getBoardDataOrFail({
  ctx,
  game,
  gameId,
  categories,
  selectedModel,
  host,
  boardJson,
  effectiveIncludeVisuals,
  effectiveImageProvider,
  reasoningEffort,
  trace,
}: {
  ctx: Ctx;
  game: GameState;
  gameId: string;
  categories: string[];
  selectedModel: string;
  host: string;
  boardJson: string;
  effectiveIncludeVisuals: boolean;
  effectiveImageProvider?: string;
  reasoningEffort: string;
  trace?: TraceLike;
}): Promise<GameState["boardData"] | null> {
  const usingImportedBoard = Boolean(boardJson && boardJson.trim());
  const ttsBatcher = makePreloadTtsBatcher({ ctx, gameId, game, trace });

  try {
    if (usingImportedBoard) {
      const imported = ctx.parseBoardJson(boardJson);
      const v = ctx.validateImportedBoardData(imported);
      if (!v.ok) {
        const message = "error" in v ? v.error : "Invalid board JSON";
        ctx.broadcast(gameId, { type: "create-board-failed", message });
        game.isGenerating = false;
        return null;
      }

      await ctx.ensureBoardNarrationTtsForBoardData({
        ctx,
        game,
        boardData: imported as Parameters<
          typeof ctx.ensureBoardNarrationTtsForBoardData
        >[0]["boardData"],
        narrationEnabled: Boolean(game?.lobbySettings?.narrationEnabled),
        onTtsReady: (id: string) => ttsBatcher.push(id),
        trace,
      });

      await ctx.ensureAiHostTtsBank({ ctx, game, trace });
      const ids = Array.isArray(game?.aiHostTts?.allAssetIds) ? game.aiHostTts.allAssetIds : [];

      broadcastPreloadBatch({
        ctx,
        gameId,
        game,
        imageAssetIds: [],
        ttsAssetIds: ids,
        final: false,
        trace,
        reason: "ai-host-bank",
      });

      ttsBatcher.flush();
      return imported as GameState["boardData"];
    }

    game.isGenerating = true;
    trace?.mark?.("createBoardData_start");

    const boardData = await ctx.createBoardData(ctx, categories, selectedModel, host, {
      includeVisuals: effectiveIncludeVisuals,
      imageProvider: effectiveImageProvider,
      maxVisualCluesPerCategory: 2,
      narrationEnabled: Boolean(game?.lobbySettings?.narrationEnabled),
      reasoningEffort: reasoningEffort as "off" | "low" | "medium" | "high",
      trace,
      onTtsReady: (id: string) => ttsBatcher.push(id),
      onProgress: ({
        done,
        total,
        progress,
      }: {
        done: number;
        total: number;
        progress: number;
      }) => {
        const g = ctx.games?.[gameId];
        if (!g) return;
        g.generationDone = done;
        g.generationTotal = total;
        g.generationProgress = progress;
        ctx.broadcast(gameId, { type: "generation-progress", progress, done, total });
      },
    });

    ttsBatcher.flush();
    trace?.mark?.("createBoardData_end");
    return boardData;
  } catch (e) {
    console.error("[Server] create-game failed:", e);
    ctx.broadcast(gameId, {
      type: "create-board-failed",
      message: "Invalid board JSON or generation failed.",
    });
    safeAbortGeneration(game);
    return null;
  }
}

import type { CtxDeps } from "../../context.types.js";
import type { WsHandler } from "../types.js";
import { buildRefreshedLobbyCategories } from "../../../lobby/categoryPoolRefresh.js";
import { applyLobbyCategoryValue, chooseRandomLobbyCategory } from "../../../lobby/categorySelection.js";
import {
  isLobbyBoardIndexInRange,
  isLobbyBoardType,
  isLockedLobbyCategory,
  parseLobbyBoardIndex,
  toGlobalLobbyCategoryIndex,
} from "../../../lobby/categorySlots.js";
import { createEmptyLockedCategories } from "../../../lobby/lockedCategories.js";
import { generateCategoryPoolFromAi } from "../../../services/ai/categoryPool.js";
import { sendLobbyErrorAndSnapshot } from "../../../lobby/socketErrors.js";
import { atLeast, normalizeRole } from "../../../../shared/roles.js";

type ToggleLockCategoryData = {
  gameId: string;
  boardType: "firstBoard" | "secondBoard" | "finalJeopardy";
  index: number;
};
type RandomizeCategoryData = {
  gameId: string;
  boardType: "firstBoard" | "secondBoard" | "finalJeopardy";
  index?: number;
};
type UpdateCategoryData = {
  gameId: string;
  boardType: "firstBoard" | "secondBoard" | "finalJeopardy";
  index?: number;
  value?: string;
};
type UpdateCategoriesData = { gameId: string; categories?: unknown };
type RefreshCategoryPoolData = { gameId: string };

type LobbyCategoryCtx = CtxDeps<
  "games" | "sendLobbySnapshot" | "broadcast" | "normalizeCategories11"
>;

export const lobbyCategoryHandlers: Record<string, WsHandler> = {
  "toggle-lock-category": async ({ data, ctx }) => {
    const hctx = ctx as LobbyCategoryCtx;
    const { gameId, boardType, index } = data as ToggleLockCategoryData;
    const game = hctx.games[gameId];
    if (!game) return;

    const bt = isLobbyBoardType(boardType) ? boardType : null;
    if (!bt) return;
    const idx = parseLobbyBoardIndex(index);
    if (idx === null || !isLobbyBoardIndexInRange(bt, idx)) return;

    if (!game.lockedCategories) {
      game.lockedCategories = createEmptyLockedCategories();
    }

    const nextLocked = !game.lockedCategories[bt][idx];
    game.lockedCategories[bt][idx] = nextLocked;

    hctx.broadcast(gameId, {
      type: "category-lock-updated",
      boardType: bt,
      index: idx,
      locked: nextLocked,
    });
  },

  "randomize-category": async ({ ws, data, ctx }) => {
    const hctx = ctx as LobbyCategoryCtx;
    const { gameId, boardType, index } = data as RandomizeCategoryData;
    const game = hctx.games[gameId];
    if (!game) return;

    const bt = isLobbyBoardType(boardType) ? boardType : null;
    if (!bt) return;

    const idx = bt === "finalJeopardy" ? 0 : parseLobbyBoardIndex(index);
    if (idx === null || !isLobbyBoardIndexInRange(bt, idx)) return;

    if (isLockedLobbyCategory(game.lockedCategories, bt, idx)) {
      sendLobbyErrorAndSnapshot({
        ws,
        gameId,
        sendLobbySnapshot: hctx.sendLobbySnapshot,
        message: "That category is locked.",
      });
      return;
    }

    const normalizedCategories = hctx.normalizeCategories11(game.categories);
    game.categories = normalizedCategories;

    let chosen = "";
    try {
      chosen = chooseRandomLobbyCategory({
        currentCategories: normalizedCategories,
        categoryPool: game.categoryPool,
      });
    } catch (error) {
      console.error("[randomize-category] failed to generate category:", error);
    }

    if (!chosen) {
      sendLobbyErrorAndSnapshot({
        ws,
        gameId,
        sendLobbySnapshot: hctx.sendLobbySnapshot,
        message: "No unique random category available.",
      });
      return;
    }

    const nextCategoryState = applyLobbyCategoryValue({
      categories: normalizedCategories,
      boardType: bt,
      index: idx,
      value: chosen,
    });
    game.categories = nextCategoryState.categories;

    hctx.broadcast(gameId, {
      type: "category-updated",
      boardType: bt,
      index: bt === "finalJeopardy" ? 0 : idx,
      value: nextCategoryState.value,
    });
  },

  "update-category": async ({ ws, data, ctx }) => {
    const hctx = ctx as LobbyCategoryCtx;
    try {
      const { gameId, boardType, index, value } = (data ?? {}) as UpdateCategoryData;

      if (!gameId) {
        ws.send(JSON.stringify({ type: "error", message: "update-category missing gameId" }));
        return;
      }

      const game = hctx.games?.[gameId];
      if (!game) {
        ws.send(JSON.stringify({ type: "error", message: `Game ${gameId} not found.` }));
        return;
      }

      const bt = isLobbyBoardType(boardType) ? boardType : null;
      if (!bt) {
        sendLobbyErrorAndSnapshot({
          ws,
          gameId,
          sendLobbySnapshot: hctx.sendLobbySnapshot,
          message: `Invalid boardType: ${String(bt)}`,
        });
        return;
      }

      const idx = bt === "finalJeopardy" ? 0 : parseLobbyBoardIndex(index);
      if (idx === null) {
        sendLobbyErrorAndSnapshot({
          ws,
          gameId,
          sendLobbySnapshot: hctx.sendLobbySnapshot,
          message: `Invalid index: ${String(index)}`,
        });
        return;
      }

      if (!isLobbyBoardIndexInRange(bt, idx)) {
        sendLobbyErrorAndSnapshot({
          ws,
          gameId,
          sendLobbySnapshot: hctx.sendLobbySnapshot,
          message: `Index out of range for ${bt}.`,
        });
        return;
      }

      if (isLockedLobbyCategory(game.lockedCategories, bt, idx)) {
        sendLobbyErrorAndSnapshot({
          ws,
          gameId,
          sendLobbySnapshot: hctx.sendLobbySnapshot,
          message: "That category is locked.",
        });
        return;
      }

      const globalIndex = toGlobalLobbyCategoryIndex(bt, idx);

      if (!Array.isArray(game.categories) || globalIndex < 0 || globalIndex > 10) {
        sendLobbyErrorAndSnapshot({
          ws,
          gameId,
          sendLobbySnapshot: ctx.sendLobbySnapshot,
          message: "Server error: invalid categories state.",
        });
        return;
      }

      const nextCategoryState = applyLobbyCategoryValue({
        categories: game.categories,
        boardType: bt,
        index: idx,
        value,
      });
      game.categories = nextCategoryState.categories;

      console.log("[update-category]", gameId, bt, idx, "->", nextCategoryState.value.slice(0, 60));

      hctx.broadcast(gameId, {
        type: "category-updated",
        boardType: bt,
        index: bt === "finalJeopardy" ? 0 : idx,
        value: nextCategoryState.value,
      });
    } catch (err) {
      console.error("[update-category] crash", err);
      ws.send(JSON.stringify({ type: "error", message: "Server error while updating category." }));
    }
  },

  "update-categories": async ({ ws, data, ctx }) => {
    const hctx = ctx as LobbyCategoryCtx;
    const { gameId, categories } = data as UpdateCategoriesData;
    const game = hctx.games[gameId];

    if (game) {
      const next = hctx.normalizeCategories11(categories);
      game.categories = next;

      hctx.broadcast(gameId, {
        type: "categories-updated",
        categories: next,
      });

      console.log(`[Server] Categories updated for game ${gameId}:`, next);
    } else {
      ws.send(
        JSON.stringify({
          type: "error",
          message: `Game ${gameId} not found while updating categories.`,
        }),
      );
    }
  },

  "refresh-category-pool": async ({ ws, data, ctx }) => {
    const hctx = ctx as LobbyCategoryCtx;
    const { gameId } = data as RefreshCategoryPoolData;
    const game = hctx.games[gameId];
    if (!game || !game.inLobby) return;

    const locked = Boolean(game.lobbySettings?.categoryRefreshLocked);
    if (locked) {
      sendLobbyErrorAndSnapshot({
        ws,
        gameId,
        sendLobbySnapshot: hctx.sendLobbySnapshot,
        message: "Category refresh is locked by the host.",
      });
      return;
    }

    const now = Date.now();
    const nextAllowed = Number(game.categoryPoolNextAllowedAtMs ?? 0);
    const role = normalizeRole(ws.auth?.role);
    const bypassCooldown = atLeast(role, "privileged");
    if (!bypassCooldown && nextAllowed && now < nextAllowed) {
      sendLobbyErrorAndSnapshot({
        ws,
        gameId,
        sendLobbySnapshot: hctx.sendLobbySnapshot,
        message: "Category pool refresh is on cooldown.",
        extra: { nextAllowedAtMs: nextAllowed },
      });
      return;
    }

    if (game.categoryPoolGenerating) {
      sendLobbyErrorAndSnapshot({
        ws,
        gameId,
        sendLobbySnapshot: hctx.sendLobbySnapshot,
        message: "Category pool refresh already in progress.",
      });
      return;
    }

    game.categoryPoolGenerating = true;
    hctx.broadcast(gameId, {
      type: "category-pool-status",
      generating: true,
      nextAllowedAtMs: game.categoryPoolNextAllowedAtMs ?? null,
    });

    try {
      const pool = await generateCategoryPoolFromAi({
        count: 60,
        prompt: game.lobbySettings?.categoryPoolPrompt ?? "",
      });
      game.categoryPool = pool;
      game.categoryPoolGeneratedAtMs = Date.now();
      game.categoryPoolNextAllowedAtMs = game.categoryPoolGeneratedAtMs + 60_000;
      game.categoryPoolGenerating = false;

      const normalizedCurrent = hctx.normalizeCategories11(game.categories);
      game.categories = hctx.normalizeCategories11(
        buildRefreshedLobbyCategories({
          currentCategories: normalizedCurrent,
          lockedCategories: game.lockedCategories,
          pool,
        }),
      );

      hctx.broadcast(gameId, {
        type: "categories-updated",
        categories: game.categories,
      });

      hctx.broadcast(gameId, {
        type: "category-pool-status",
        generating: false,
        nextAllowedAtMs: game.categoryPoolNextAllowedAtMs,
        lastGeneratedAtMs: game.categoryPoolGeneratedAtMs,
      });
    } catch (e) {
      console.error("[refresh-category-pool] failed:", e);
      game.categoryPoolGenerating = false;
      sendLobbyErrorAndSnapshot({
        ws,
        gameId,
        sendLobbySnapshot: hctx.sendLobbySnapshot,
        message: "Failed to refresh category pool.",
      });
    }
  },
};

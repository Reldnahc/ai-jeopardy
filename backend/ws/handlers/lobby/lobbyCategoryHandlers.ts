import type { CtxDeps } from "../../context.types.js";
import type { WsHandler } from "../types.js";
import type { GameState } from "../../../types/runtime.js";
import { buildRefreshedLobbyCategories } from "../../../lobby/categoryPoolRefresh.js";
import { createEmptyLockedCategories } from "../../../lobby/lockedCategories.js";
import { getUniqueCategories } from "../../../services/categories/getUniqueCategories.js";
import { shuffle, normalizeCategory } from "../../../services/categories/categoryUtils.js";
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

type BoardType = "firstBoard" | "secondBoard" | "finalJeopardy";

export function isBoardType(v: unknown): v is BoardType {
  return v === "firstBoard" || v === "secondBoard" || v === "finalJeopardy";
}

export function parseBoardIndex(index: unknown): number | null {
  const idx = Number(index);
  if (!Number.isFinite(idx)) return null;
  return idx;
}

export function isBoardIndexInRange(boardType: BoardType, index: number): boolean {
  if (boardType === "finalJeopardy") return index === 0;
  return index >= 0 && index <= 4;
}

export function toGlobalCategoryIndex(boardType: BoardType, index: number): number {
  if (boardType === "firstBoard") return index;
  if (boardType === "secondBoard") return 5 + index;
  return 10;
}

export function isLockedCategory(
  locked: GameState["lockedCategories"] | undefined,
  boardType: BoardType,
  index: number,
): boolean {
  if (!locked) return false;
  if (boardType === "finalJeopardy") return Boolean(locked.finalJeopardy?.[0]);
  return Boolean(locked[boardType]?.[index]);
}

export const lobbyCategoryHandlers: Record<string, WsHandler> = {
  "toggle-lock-category": async ({ data, ctx }) => {
    const hctx = ctx as LobbyCategoryCtx;
    const { gameId, boardType, index } = data as ToggleLockCategoryData;
    const game = hctx.games[gameId];
    if (!game) return;

    const bt = isBoardType(boardType) ? boardType : null;
    if (!bt) return;
    const idx = parseBoardIndex(index);
    if (idx === null || !isBoardIndexInRange(bt, idx)) return;

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

    const bt = isBoardType(boardType) ? boardType : null;
    if (!bt) return;

    const idx = bt === "finalJeopardy" ? 0 : parseBoardIndex(index);
    if (idx === null || !isBoardIndexInRange(bt, idx)) return;

    if (isLockedCategory(game.lockedCategories, bt, idx)) {
      sendLobbyErrorAndSnapshot({
        ws,
        gameId,
        sendLobbySnapshot: hctx.sendLobbySnapshot,
        message: "That category is locked.",
      });
      return;
    }

    game.categories = hctx.normalizeCategories11(game.categories);

    const globalIndex = toGlobalCategoryIndex(bt, idx);

    const exclude = game.categories
      .map((c: unknown) => String(c ?? "").trim())
      .filter((v: string) => v.length > 0);

    let chosen = "";
    const pool = Array.isArray(game.categoryPool) ? game.categoryPool : [];
    const normalizedExclude = new Set(exclude.map(normalizeCategory));
    const poolChoices = shuffle(pool).filter((c) => {
      const key = normalizeCategory(String(c ?? ""));
      return key && !normalizedExclude.has(key);
    });

    if (poolChoices.length > 0) {
      chosen = String(poolChoices[0] ?? "").trim();
    } else {
      try {
        chosen = getUniqueCategories(1, { exclude })[0] ?? "";
      } catch (e) {
        console.error("[randomize-category] failed to generate category:", e);
      }
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

    game.categories[globalIndex] = chosen;

    hctx.broadcast(gameId, {
      type: "category-updated",
      boardType: bt,
      index: bt === "finalJeopardy" ? 0 : idx,
      value: chosen,
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

      const bt = isBoardType(boardType) ? boardType : null;
      if (!bt) {
        sendLobbyErrorAndSnapshot({
          ws,
          gameId,
          sendLobbySnapshot: hctx.sendLobbySnapshot,
          message: `Invalid boardType: ${String(bt)}`,
        });
        return;
      }

      const idx = bt === "finalJeopardy" ? 0 : parseBoardIndex(index);
      if (idx === null) {
        sendLobbyErrorAndSnapshot({
          ws,
          gameId,
          sendLobbySnapshot: hctx.sendLobbySnapshot,
          message: `Invalid index: ${String(index)}`,
        });
        return;
      }

      if (!isBoardIndexInRange(bt, idx)) {
        sendLobbyErrorAndSnapshot({
          ws,
          gameId,
          sendLobbySnapshot: hctx.sendLobbySnapshot,
          message: `Index out of range for ${bt}.`,
        });
        return;
      }

      if (isLockedCategory(game.lockedCategories, bt, idx)) {
        sendLobbyErrorAndSnapshot({
          ws,
          gameId,
          sendLobbySnapshot: hctx.sendLobbySnapshot,
          message: "That category is locked.",
        });
        return;
      }

      const globalIndex = toGlobalCategoryIndex(bt, idx);

      if (!Array.isArray(game.categories) || globalIndex < 0 || globalIndex > 10) {
        sendLobbyErrorAndSnapshot({
          ws,
          gameId,
          sendLobbySnapshot: ctx.sendLobbySnapshot,
          message: "Server error: invalid categories state.",
        });
        return;
      }

      const nextVal = String(value ?? "").replace(/^\s+/, "");
      game.categories[globalIndex] = nextVal;

      console.log("[update-category]", gameId, bt, idx, "->", nextVal.slice(0, 60));

      hctx.broadcast(gameId, {
        type: "category-updated",
        boardType: bt,
        index: bt === "finalJeopardy" ? 0 : idx,
        value: nextVal,
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

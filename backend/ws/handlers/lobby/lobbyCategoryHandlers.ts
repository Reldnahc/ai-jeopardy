import type { CtxDeps } from "../../context.types.js";
import type { WsHandler } from "../types.js";
import { getUniqueCategories } from "../../../services/categories/getUniqueCategories.js";
import { shuffle, normalizeCategory } from "../../../services/categories/categoryUtils.js";
import { generateCategoryPoolFromOpenAi } from "../../../services/ai/categoryPool.js";

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
  | "games"
  | "isHostSocket"
  | "sendLobbySnapshot"
  | "broadcast"
  | "normalizeCategories11"
>;

export const lobbyCategoryHandlers: Record<string, WsHandler> = {
  "toggle-lock-category": async ({ ws, data, ctx }) => {
    const hctx = ctx as LobbyCategoryCtx;
    const { gameId, boardType, index } = data as ToggleLockCategoryData;
    const game = hctx.games[gameId];
    if (!game) return;

    if (!hctx.isHostSocket(game, ws)) {
      ws.send(
        JSON.stringify({ type: "error", message: "Only the host can toggle category locks." }),
      );
      hctx.sendLobbySnapshot(ws, gameId);
      return;
    }

    const bt = boardType;
    if (bt !== "firstBoard" && bt !== "secondBoard" && bt !== "finalJeopardy") return;

    const idx = Number(index);
    if (!Number.isFinite(idx)) return;
    if ((bt === "firstBoard" || bt === "secondBoard") && (idx < 0 || idx > 4)) return;
    if (bt === "finalJeopardy" && idx !== 0) return;

    if (!game.lockedCategories) {
      game.lockedCategories = {
        firstBoard: Array(5).fill(false),
        secondBoard: Array(5).fill(false),
        finalJeopardy: Array(1).fill(false),
      };
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

    const bt = boardType;
    if (bt !== "firstBoard" && bt !== "secondBoard" && bt !== "finalJeopardy") return;

    const idx = bt === "finalJeopardy" ? 0 : Number(index);
    if (!Number.isFinite(idx)) return;
    if ((bt === "firstBoard" || bt === "secondBoard") && (idx < 0 || idx > 4)) return;

    if ((bt === "firstBoard" || bt === "secondBoard") && game.lockedCategories?.[bt]?.[idx]) {
      ws.send(JSON.stringify({ type: "error", message: "That category is locked." }));
      hctx.sendLobbySnapshot(ws, gameId);
      return;
    }
    if (bt === "finalJeopardy" && game.lockedCategories?.finalJeopardy?.[0]) {
      ws.send(JSON.stringify({ type: "error", message: "That category is locked." }));
      hctx.sendLobbySnapshot(ws, gameId);
      return;
    }

    game.categories = hctx.normalizeCategories11(game.categories);

    let globalIndex = -1;
    if (bt === "firstBoard") globalIndex = idx;
    else if (bt === "secondBoard") globalIndex = 5 + idx;
    else globalIndex = 10;

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
      ws.send(JSON.stringify({ type: "error", message: "No unique random category available." }));
      hctx.sendLobbySnapshot(ws, gameId);
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

      const bt = boardType;
      if (bt !== "firstBoard" && bt !== "secondBoard" && bt !== "finalJeopardy") {
        ws.send(JSON.stringify({ type: "error", message: `Invalid boardType: ${String(bt)}` }));
        hctx.sendLobbySnapshot(ws, gameId);
        return;
      }

      const idx = bt === "finalJeopardy" ? 0 : Number(index);
      if (!Number.isFinite(idx)) {
        ws.send(JSON.stringify({ type: "error", message: `Invalid index: ${String(index)}` }));
        hctx.sendLobbySnapshot(ws, gameId);
        return;
      }

      if ((bt === "firstBoard" || bt === "secondBoard") && (idx < 0 || idx > 4)) {
        ws.send(JSON.stringify({ type: "error", message: `Index out of range for ${bt}.` }));
        hctx.sendLobbySnapshot(ws, gameId);
        return;
      }

      if ((bt === "firstBoard" || bt === "secondBoard") && game.lockedCategories?.[bt]?.[idx]) {
        ws.send(JSON.stringify({ type: "error", message: "That category is locked." }));
        hctx.sendLobbySnapshot(ws, gameId);
        return;
      }
      if (bt === "finalJeopardy" && game.lockedCategories?.finalJeopardy?.[0]) {
        ws.send(JSON.stringify({ type: "error", message: "That category is locked." }));
        hctx.sendLobbySnapshot(ws, gameId);
        return;
      }

      const globalIndex = bt === "firstBoard" ? idx : bt === "secondBoard" ? 5 + idx : 10;

      if (!Array.isArray(game.categories) || globalIndex < 0 || globalIndex > 10) {
        ws.send(
          JSON.stringify({ type: "error", message: "Server error: invalid categories state." }),
        );
        ctx.sendLobbySnapshot(ws, gameId);
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
      ws.send(JSON.stringify({ type: "error", message: "Category refresh is locked by the host." }));
      hctx.sendLobbySnapshot(ws, gameId);
      return;
    }

    const now = Date.now();
    const nextAllowed = Number(game.categoryPoolNextAllowedAtMs ?? 0);
    if (nextAllowed && now < nextAllowed) {
      ws.send(
        JSON.stringify({
          type: "error",
          message: "Category pool refresh is on cooldown.",
          nextAllowedAtMs: nextAllowed,
        }),
      );
      hctx.sendLobbySnapshot(ws, gameId);
      return;
    }

    if (game.categoryPoolGenerating) {
      ws.send(JSON.stringify({ type: "error", message: "Category pool refresh already in progress." }));
      hctx.sendLobbySnapshot(ws, gameId);
      return;
    }

    game.categoryPoolGenerating = true;
    hctx.broadcast(gameId, {
      type: "category-pool-status",
      generating: true,
      nextAllowedAtMs: game.categoryPoolNextAllowedAtMs ?? null,
    });

    try {
      const pool = await generateCategoryPoolFromOpenAi({
        count: 60,
        prompt: game.lobbySettings?.categoryPoolPrompt ?? "",
      });
      game.categoryPool = pool;
      game.categoryPoolGeneratedAtMs = Date.now();
      game.categoryPoolNextAllowedAtMs = game.categoryPoolGeneratedAtMs + 60_000;
      game.categoryPoolGenerating = false;

      const poolSet = pool.map((c) => String(c ?? "").trim()).filter(Boolean);
      const shuffledPool = shuffle(poolSet);
      const replacement =
        shuffledPool.length >= 11 ? shuffledPool.slice(0, 11) : getUniqueCategories(11, { exclude: [] });

      game.categories = hctx.normalizeCategories11(replacement);

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
      ws.send(JSON.stringify({ type: "error", message: "Failed to refresh category pool." }));
      hctx.sendLobbySnapshot(ws, gameId);
    }
  },
};

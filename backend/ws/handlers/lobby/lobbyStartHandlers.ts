import type { PlayerState } from "../../../types/runtime.js";
import type { WsHandler } from "../types.js";

type GameIdData = { gameId: string };
type PreloadDoneData = { gameId: string; username?: string; token?: number; playerKey?: string };
type GameReadyData = { gameId: string; username?: string };

export const lobbyStartHandlers: Record<string, WsHandler> = {
  "create-game": async ({ ws, data, ctx }) => {
    const { gameId } = (data ?? {}) as GameIdData;

    const serverHost = gameId && ctx.games?.[gameId]?.host ? ctx.games[gameId].host : undefined;
    const trace = ctx.createTrace("create-game", { gameId, host: serverHost });
    trace.mark("ws_received", { type: "create-game" });

    const game = ctx.getGameOrFail({ ws, ctx, gameId });
    if (!game) return;

    if (!ctx.ensureHostOrFail({ ws, ctx, gameId, game })) return;

    const s = ctx.ensureLobbySettings(ctx, game, ctx.appConfig);
    const host = game.host;
    const categories = ctx.normalizeCategories11(game.categories);
    const role = ctx.normalizeRole(ws);
    const selectedModel = s.selectedModel;
    const modelAllowed = ctx.resolveModelOrFail({ ws, ctx, gameId, game, selectedModel });
    if (!modelAllowed) return;

    const timeToBuzz = s.timeToBuzz;
    const timeToAnswer = s.timeToAnswer;
    const reasoningEffort = s.reasoningEffort;
    const boardJson = typeof s.boardJson === "string" ? s.boardJson : "";
    const visualMode = s.visualMode;

    const {
      usingImportedBoard,
      effectiveIncludeVisuals,
      requestedProvider,
      canUseBrave,
      effectiveImageProvider,
    } = ctx.resolveVisualPolicy({ role, boardJson, visualMode });

    trace.mark("visual_settings", {
      usingImportedBoard,
      includeVisuals: effectiveIncludeVisuals,
      requestedProvider,
      effectiveImageProvider,
      canUseBrave,
      visualMode,
    });

    if (!game.inLobby) {
      ws.send(JSON.stringify({ type: "error", message: "Game has already started." }));
      return;
    }

    ctx.resetGenerationProgressAndNotify({ ctx, gameId, game });
    ctx.initPreloadState({ ctx, gameId, game, trace });

    void (async () => {
      try {
        await ctx.ensureAiHostTtsBank({ ctx, game, trace });
        const ids = Array.isArray(game?.aiHostTts?.allAssetIds) ? game.aiHostTts.allAssetIds : [];
        ctx.broadcastPreloadBatch({
          ctx,
          gameId,
          game,
          imageAssetIds: [],
          ttsAssetIds: ids,
          final: false,
          trace,
          reason: "ai-host-bank",
        });
      } catch (e) {
        console.error("[create-game] ai host tts bank failed:", e);
        game.aiHostTts = {
          slotAssets: {},
          nameAssetsByPlayer: {},
          allAssetIds: [],
          categoryAssetsByCategory: {},
        };
      }
    })();

    const boardData = await ctx.getBoardDataOrFail({
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
    });

    if (!ctx.games?.[gameId] || !boardData) {
      ctx.broadcast(gameId, { type: "create-board-failed", message: "Board data was empty." });
      ctx.safeAbortGeneration(game);
      return;
    }

    if (!game.inLobby) {
      ctx.safeAbortGeneration(game);
      return;
    }

    ctx.applyNewGameState({ game, boardData, timeToBuzz, timeToAnswer });

    void (async () => {
      try {
        await ctx.ensureAiHostValueTts({ ctx, game, trace });
        const ids = Array.isArray(game?.aiHostTts?.allAssetIds) ? game.aiHostTts.allAssetIds : [];
        ctx.broadcastPreloadBatch({
          ctx,
          gameId,
          game,
          imageAssetIds: [],
          ttsAssetIds: ids,
          final: false,
          trace,
          reason: "ai-host-bank-values",
        });
      } catch (e) {
        console.error("[create-game] ai host tts bank failed:", e);
        game.aiHostTts = {
          slotAssets: {},
          nameAssetsByPlayer: {},
          allAssetIds: [],
          categoryAssetsByCategory: {},
          valueAssetsByValue: {},
        };
      }
    })();

    const online = (game.players ?? []).filter((p: PlayerState) => p?.online !== false);
    const pool = online.length > 0 ? online : (game.players ?? []);
    const pick = pool.length > 0 ? pool[Math.floor(Math.random() * pool.length)] : null;

    if (pick) {
      game.selectorKey = pick.username;
      game.selectorName = pick.displayname;
    } else {
      game.selectorKey = null;
      game.selectorName = null;
    }

    game.phase = null;
    game.welcomeEndsAt = null;
    if (game.welcomeTimer) {
      clearTimeout(game.welcomeTimer);
      game.welcomeTimer = null;
    }

    trace.mark("broadcast_game_state_start");
    await ctx.setupPreloadHandshake({ ctx, gameId, game, boardData, trace });
    trace.mark("broadcast_game_state_end");
    trace.end({ success: true });
  },

  "preload-done": async ({ data, ctx }) => {
    const { gameId, username, token, playerKey } = (data ?? {}) as PreloadDoneData;
    if (!gameId || !ctx.games?.[gameId]) return;

    const game = ctx.games[gameId];
    if (!game.preload) return;

    const stableRaw = String(username ?? playerKey ?? "").trim();
    const stable = stableRaw.toLowerCase();
    if (!stable) return;

    const tok = Number(token);
    const finalToken = Number(game.preload.finalToken) || 0;

    game.preload.acksByPlayer ||= {};
    game.preload.acksByPlayer[stable] = Number.isFinite(tok) ? tok : finalToken;
    if (!finalToken) return;

    if (
      !Array.isArray(game.preload.requiredForToken) ||
      game.preload.requiredForToken.length === 0
    ) {
      game.preload.requiredForToken = (game.players ?? [])
        .filter((p: PlayerState) => p.online)
        .map((p: PlayerState) =>
          String(ctx.playerStableId(p) ?? "")
            .trim()
            .toLowerCase(),
        )
        .filter(Boolean);
    }

    const required = game.preload.requiredForToken;
    const allDone = required.every((id: string) => game.preload.acksByPlayer?.[id] === finalToken);
    if (!allDone) return;

    game.preload.active = false;
    game.inLobby = false;
    game.isLoading = false;
    if (!game.lobbyHost) game.lobbyHost = game.host;
    game.host = "AI Jeopardy";

    ctx.broadcast(gameId, { type: "start-game", host: game.host });

    const requiredNow = (game.players ?? [])
      .filter((p: PlayerState) => p.online)
      .map((p: PlayerState) =>
        String(ctx.playerStableId(p) ?? "")
          .trim()
          .toLowerCase(),
      )
      .filter(Boolean);

    game.gameReady = {
      expected: Object.fromEntries(requiredNow.map((id: string) => [id, true])) as Record<
        string,
        boolean
      >,
      acks: {},
      done: false,
    };

    game.phase = null;
    ctx.broadcast(gameId, {
      type: "phase-changed",
      phase: game.phase,
      selectorKey: game.selectorKey ?? null,
      selectorName: game.selectorName ?? null,
    });
  },

  "game-ready": async ({ data, ctx }) => {
    const { gameId, username } = (data ?? {}) as GameReadyData;
    if (!gameId || !ctx.games?.[gameId]) return;

    const game = ctx.games[gameId];
    if (!game.gameReady || game.gameReady.done) return;

    const stable = String(username ?? "")
      .trim()
      .toLowerCase();
    if (!stable) return;
    if (!game.gameReady.expected?.[stable]) return;

    game.gameReady.acks[stable] = true;

    const expectedIds = Object.keys(game.gameReady.expected);
    const allReady = expectedIds.every((id: string) => game.gameReady.acks[id]);
    if (!allReady) return;

    game.gameReady.done = true;
    const selectorName = String(game.selectorName ?? "").trim();

    if (selectorName) {
      for (const player of game.players) {
        ctx.fireAndForget(
          ctx.repos.profiles.incrementGamesPlayed(player.username),
          "update games played",
        );
      }

      game.phase = "welcome";
      game.welcomeEndsAt = null;

      ctx.broadcast(gameId, {
        type: "phase-changed",
        phase: "welcome",
        selectorKey: game.selectorKey ?? null,
        selectorName: game.selectorName ?? null,
      });

      void (async () => {
        const pad = 25;

        await ctx.aiHostVoiceSequence(ctx, gameId, game, [
          { slot: "welcome_intro", pad },
          { slot: selectorName, pad },
          { slot: "welcome_outro" },
        ]);

        if (game.welcomeTimer) {
          clearTimeout(game.welcomeTimer);
          game.welcomeTimer = null;
        }

        game.welcomeTimer = setTimeout(() => {
          const g = ctx.games?.[gameId];
          if (!g) return;
          if (g.phase !== "welcome") return;

          g.phase = "board";
          g.welcomeTimer = null;

          ctx.broadcast(gameId, {
            type: "phase-changed",
            phase: "board",
            selectorKey: g.selectorKey ?? null,
            selectorName: g.selectorName ?? null,
          });
        }, 600);
      })();
    } else {
      game.phase = "board";
      game.welcomeEndsAt = null;

      ctx.broadcast(gameId, {
        type: "phase-changed",
        phase: "board",
        selectorKey: game.selectorKey ?? null,
        selectorName: game.selectorName ?? null,
      });
    }
  },
};

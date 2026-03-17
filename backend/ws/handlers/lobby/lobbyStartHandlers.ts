import type { PlayerState } from "../../../types/runtime.js";
import type { WsHandler } from "../types.js";
import { shouldIncrementStats } from "../../../game/statsGate.js";
import { normalizeRole, asLadderRole } from "../../../../shared/roles.js";
import {
  acknowledgeGameReady,
  acknowledgePreloadDone,
  activateGameReadyHandshake,
  clearWelcomeTimer,
  chooseStartingSelector,
  enterBoardPhase,
  enterWelcomePhase,
  resetLobbyStartPhase,
} from "../../../lobby/startFlow.js";

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
    const role = normalizeRole(ws.auth.role);
    const ladderRole = asLadderRole(role);
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
    } = ctx.resolveVisualPolicy({ role: ladderRole, boardJson, visualMode });

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

    ctx.applyNewGameState({ game, boardData, timeToBuzz, timeToAnswer, usingImportedBoard });

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

    chooseStartingSelector(game);
    resetLobbyStartPhase(game);

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
    const allDone = acknowledgePreloadDone({
      game,
      stableId: stable,
      token: tok,
      playerStableId: (player: PlayerState) => ctx.playerStableId(player),
    });
    if (!allDone) return;

    activateGameReadyHandshake(game, (player: PlayerState) => ctx.playerStableId(player));

    ctx.broadcast(gameId, { type: "start-game", host: game.host });
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
    const allReady = acknowledgeGameReady(game, stable);
    if (!allReady) return;
    const selectorName = String(game.selectorName ?? "").trim();

    if (selectorName) {
      const allowStats = shouldIncrementStats(game);
      for (const player of game.players) {
        if (allowStats) {
          ctx.fireAndForget(
            ctx.repos.profiles.incrementGamesPlayed(player.username),
            "update games played",
          );
        }
      }

      enterWelcomePhase(game);

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

        clearWelcomeTimer(game);

        game.welcomeTimer = setTimeout(() => {
          const g = ctx.games?.[gameId];
          if (!g) return;
          if (g.phase !== "welcome") return;

          enterBoardPhase(g);
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
      enterBoardPhase(game);

      ctx.broadcast(gameId, {
        type: "phase-changed",
        phase: "board",
        selectorKey: game.selectorKey ?? null,
        selectorName: game.selectorName ?? null,
      });
    }
  },
};

import type { PlayerState } from "../../../types/runtime.js";
import type { CtxDeps } from "../../context.types.js";
import type { WsHandler } from "../types.js";
import { MAX_LOBBY_PLAYERS } from "../../../lobby/constants.js";
import { ensureGameLobbySettings } from "../../../lobby/settings.js";
import { atLeast, normalizeRole } from "../../../../shared/roles.js";
import type {
  CheckLobbyResponseMessage,
  LobbySettingsUpdatedMessage,
} from "../../../../shared/types/lobby.js";

type GameIdData = { gameId: string };
type UpdateLobbySettingsData = { gameId: string; patch?: Record<string, unknown> };
type CheckLobbyData = { gameId: string; username?: string; playerKey?: string };
type PromoteHostData = { gameId: string; targetUsername?: string };
type UpdateCategoryPromptData = { gameId: string; prompt?: string };

type LobbyConfigCtx = CtxDeps<
  | "games"
  | "isHostSocket"
  | "appConfig"
  | "broadcast"
  | "requireHost"
  | "buildLobbyState"
  | "sendLobbySnapshot"
>;

export const lobbyConfigHandlers: Record<string, WsHandler> = {
  "update-lobby-settings": async ({ ws, data, ctx }) => {
    const hctx = ctx as LobbyConfigCtx;
    try {
      const { gameId, patch } = (data ?? {}) as UpdateLobbySettingsData;
      if (!gameId) {
        ws.send(JSON.stringify({ type: "error", message: "update-lobby-settings missing gameId" }));
        return;
      }

      const game = hctx.games?.[gameId];
      if (!game) {
        ws.send(JSON.stringify({ type: "error", message: `Game ${gameId} not found.` }));
        return;
      }

      if (!hctx.isHostSocket(game, ws)) {
        ws.send(
          JSON.stringify({ type: "error", message: "Only the host can update lobby settings." }),
        );
        return;
      }

      const lobbySettings = ensureGameLobbySettings(game, hctx.appConfig.ai);

      const p =
        typeof patch === "object" && patch !== null ? (patch as Record<string, unknown>) : {};
      const role = normalizeRole(ws.auth?.role);
      const canChooseTtsProvider = atLeast(role, "privileged");

      if (typeof p.timeToBuzz === "number" && Number.isFinite(p.timeToBuzz)) {
        lobbySettings.timeToBuzz = Math.max(1, Math.min(60, Math.floor(p.timeToBuzz)));
      }
      if (typeof p.timeToAnswer === "number" && Number.isFinite(p.timeToAnswer)) {
        lobbySettings.timeToAnswer = Math.max(1, Math.min(60, Math.floor(p.timeToAnswer)));
      }
      if (typeof p.selectedModel === "string" && p.selectedModel.trim()) {
        lobbySettings.selectedModel = p.selectedModel.trim();
      }
      if (
        p.reasoningEffort === "off" ||
        p.reasoningEffort === "low" ||
        p.reasoningEffort === "medium" ||
        p.reasoningEffort === "high"
      ) {
        lobbySettings.reasoningEffort = p.reasoningEffort;
      }
      if (p.visualMode === "off" || p.visualMode === "commons" || p.visualMode === "brave") {
        lobbySettings.visualMode = p.visualMode;
      }
      if (typeof p.boardJson === "string") {
        lobbySettings.boardJson = p.boardJson;
      }
      if (typeof p.narrationEnabled === "boolean") {
        lobbySettings.narrationEnabled = p.narrationEnabled;
      }
      if (p.sttProviderName === "openai" || p.sttProviderName === "whisper") {
        lobbySettings.sttProviderName = p.sttProviderName;
      }
      if (
        canChooseTtsProvider &&
        (p.ttsProviderName === "openai" || p.ttsProviderName === "kokoro")
      ) {
        lobbySettings.ttsProviderName = p.ttsProviderName;
      }
      if (typeof p.categoryRefreshLocked === "boolean") {
        lobbySettings.categoryRefreshLocked = p.categoryRefreshLocked;
      }
      if (typeof p.categoryPoolPrompt === "string") {
        lobbySettings.categoryPoolPrompt = p.categoryPoolPrompt;
      }

      const payload: LobbySettingsUpdatedMessage = {
        type: "lobby-settings-updated",
        gameId,
        lobbySettings,
      };

      hctx.broadcast(gameId, payload);
    } catch (e) {
      console.error("update-lobby-settings failed:", e);
      ws.send(JSON.stringify({ type: "error", message: "update-lobby-settings failed" }));
    }
  },

  "update-category-prompt": async ({ ws, data, ctx }) => {
    const hctx = ctx as LobbyConfigCtx;
    const { gameId, prompt } = (data ?? {}) as UpdateCategoryPromptData;
    if (!gameId) {
      ws.send(JSON.stringify({ type: "error", message: "update-category-prompt missing gameId" }));
      return;
    }

    const game = hctx.games?.[gameId];
    if (!game || !game.inLobby) {
      ws.send(JSON.stringify({ type: "error", message: `Game ${gameId} not found.` }));
      return;
    }

    const lobbySettings = ensureGameLobbySettings(game, hctx.appConfig.ai);

    if (lobbySettings.categoryRefreshLocked) {
      ws.send(
        JSON.stringify({ type: "error", message: "Category refresh is locked by the host." }),
      );
      hctx.sendLobbySnapshot(ws, gameId);
      return;
    }

    lobbySettings.categoryPoolPrompt = String(prompt ?? "").slice(0, 500);

    const payload: LobbySettingsUpdatedMessage = {
      type: "lobby-settings-updated",
      gameId,
      lobbySettings,
    };

    hctx.broadcast(gameId, payload);
  },

  "check-lobby": async ({ ws, data, ctx }) => {
    const hctx = ctx as LobbyConfigCtx;
    const { gameId, username, playerKey } = data as CheckLobbyData;

    const game = hctx.games?.[gameId];
    const inLobby = Boolean(game && game.inLobby === true);

    const u = String(username ?? "")
      .trim()
      .toLowerCase();
    const pk = typeof playerKey === "string" ? playerKey.trim() : "";

    const isAlreadyInLobby = Boolean(
      game?.players?.some((p: PlayerState) => {
        if (pk && p.playerKey && p.playerKey === pk) return true;
        return (
          u &&
          String(p.username ?? "")
            .trim()
            .toLowerCase() === u
        );
      }),
    );

    const isFull = Boolean(
      inLobby &&
      game?.players?.length != null &&
      game.players.length >= MAX_LOBBY_PLAYERS &&
      !isAlreadyInLobby,
    );

    const isValid = Boolean(inLobby && !isFull);

    const payload: CheckLobbyResponseMessage = {
      type: "check-lobby-response",
      isValid,
      isFull,
      maxPlayers: MAX_LOBBY_PLAYERS,
      gameId,
    };

    ws.send(JSON.stringify(payload));
  },

  "promote-host": async ({ ws, data, ctx }) => {
    const hctx = ctx as LobbyConfigCtx;
    const { gameId, targetUsername } = (data ?? {}) as PromoteHostData;
    const game = hctx.games?.[gameId];
    if (!game || !game.inLobby) return;
    if (!hctx.requireHost(game, ws)) return;

    const targetU = String(targetUsername ?? "")
      .trim()
      .toLowerCase();
    if (!targetU) return;

    const targetPlayer = (game.players || []).find(
      (p: PlayerState) =>
        String(p.username ?? "")
          .trim()
          .toLowerCase() === targetU,
    );
    if (!targetPlayer) return;
    if (game.host === targetU) return;

    game.host = targetU;

    hctx.broadcast(gameId, {
      type: "player-list-update",
      players: game.players.map((p: PlayerState) => ({
        username: p.username,
        displayname: p.displayname,
        online: Boolean(p.online),
      })),
      host: game.host,
    });
  },

  "request-lobby-state": async ({ ws, data, ctx }) => {
    const hctx = ctx as LobbyConfigCtx;
    const gameId = (data as GameIdData).gameId;
    const snapshot = hctx.buildLobbyState(gameId, ws);
    if (!snapshot) {
      ws.send(JSON.stringify({ type: "error", message: "Lobby does not exist!" }));
      return;
    }
    ws.send(JSON.stringify(snapshot));
  },
};

import type { GameState, SocketState } from "../../../../types/runtime.js";
import type { Ctx } from "../../../context.types.js";
import { ensureGameLobbySettings } from "../../../../lobby/settings.js";
import { sendLobbyErrorAndSnapshot } from "../../../../lobby/socketErrors.js";
import { atLeast, LadderRole } from "../../../../../shared/roles.js";

type CreateGameArgs = { ws: SocketState; ctx: Ctx; gameId: string; game?: GameState | null };

export function getGameOrFail({ ws, ctx, gameId }: CreateGameArgs): GameState | null {
  if (!gameId) {
    ws.send(JSON.stringify({ type: "error", message: "create-game missing gameId" }));
    return null;
  }

  const game = ctx.games?.[gameId];
  if (!game) {
    ctx.broadcast(gameId, { type: "create-board-failed", message: "Game not found." });
    return null;
  }

  return game;
}

export function ensureHostOrFail({
  ws,
  ctx,
  gameId,
  game,
}: CreateGameArgs & { game: GameState }): boolean {
  if (!ctx.isHostSocket(game, ws)) {
    sendLobbyErrorAndSnapshot({
      ws,
      gameId,
      sendLobbySnapshot: ctx.sendLobbySnapshot,
      message: "Only the host can start the game.",
    });
    return false;
  }
  return true;
}

export function ensureLobbySettings(
  _ctx: Ctx,
  game: GameState,
  appConfig: Ctx["appConfig"],
): NonNullable<GameState["lobbySettings"]> {
  return ensureGameLobbySettings(game, appConfig.ai, { narrationEnabled: false });
}

export function resolveModelOrFail({
  ws,
  ctx,
  gameId,
  game,
  selectedModel,
}: CreateGameArgs & { game: GameState; selectedModel: string }): boolean {
  const m = ctx.modelsByValue?.[selectedModel];

  if (!m) {
    sendLobbyErrorAndSnapshot({
      ws,
      gameId,
      sendLobbySnapshot: ctx.sendLobbySnapshot,
      message: "Unknown model selected.",
    });
    return false;
  }

  if (m.disabled) {
    game.lobbySettings.selectedModel = ctx.appConfig.ai.defaultGenerationModel;
    sendLobbyErrorAndSnapshot({
      ws,
      gameId,
      sendLobbySnapshot: ctx.sendLobbySnapshot,
      message: "That model is currently disabled.",
    });
    return false;
  }

  const isPaidModel = Number(m.price ?? 0) > 0;
  if (isPaidModel) {
    const allowed = ctx.perms.can(ws, "models:use-any", { selectedModel, gameId });
    if (!allowed) {
      game.lobbySettings.selectedModel = ctx.appConfig.ai.defaultGenerationModel;
      sendLobbyErrorAndSnapshot({
        ws,
        gameId,
        sendLobbySnapshot: ctx.sendLobbySnapshot,
        message: "Your account is not allowed to use paid models.",
      });
      return false;
    }
  }

  return true;
}

export function resolveVisualPolicy({
  role,
  boardJson,
  visualMode,
}: {
  role: LadderRole;
  boardJson: string;
  visualMode: string;
}): {
  usingImportedBoard: boolean;
  effectiveIncludeVisuals: boolean;
  requestedProvider: string;
  canUseBrave: boolean;
  effectiveImageProvider?: string;
} {
  const usingImportedBoard = Boolean(boardJson && boardJson.trim());
  const effectiveIncludeVisuals = usingImportedBoard ? true : visualMode !== "off";
  const requestedProvider = visualMode === "brave" ? "brave" : "commons";
  const canUseBrave = atLeast(role, "privileged");

  const effectiveImageProvider = effectiveIncludeVisuals
    ? requestedProvider === "brave" && canUseBrave
      ? "brave"
      : "commons"
    : undefined;

  return {
    usingImportedBoard,
    effectiveIncludeVisuals,
    requestedProvider,
    canUseBrave,
    effectiveImageProvider,
  };
}

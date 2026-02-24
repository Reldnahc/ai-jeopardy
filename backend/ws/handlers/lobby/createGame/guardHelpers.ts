import type { GameState, SocketState } from "../../../../types/runtime.js";
import type { Ctx } from "../../../context.types.js";

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
    ws.send(JSON.stringify({ type: "error", message: "Only the host can start the game." }));
    ctx.sendLobbySnapshot(ws, gameId);
    return false;
  }
  return true;
}

export function ensureLobbySettings(
  ctx: Ctx,
  game: GameState,
  appConfig: { ai: { defaultModel: string } },
): NonNullable<GameState["lobbySettings"]> {
  if (game.lobbySettings) return game.lobbySettings;

  game.lobbySettings = {
    timeToBuzz: 10,
    timeToAnswer: 10,
    selectedModel: appConfig.ai.defaultModel,
    reasoningEffort: "off",
    visualMode: "off",
    narrationEnabled: false,
    boardJson: "",
    sttProviderName: ctx.appConfig.ai.defaultSttProvider,
  };

  return game.lobbySettings;
}

export function normalizeRole(ws: SocketState): string {
  return String(ws.auth?.role ?? "default").toLowerCase();
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
    ws.send(JSON.stringify({ type: "error", message: "Unknown model selected." }));
    ctx.sendLobbySnapshot(ws, gameId);
    return false;
  }

  if (m.disabled) {
    ws.send(JSON.stringify({ type: "error", message: "That model is currently disabled." }));
    game.lobbySettings.selectedModel = ctx.appConfig.ai.defaultModel;
    ctx.sendLobbySnapshot(ws, gameId);
    return false;
  }

  const isPaidModel = Number(m.price ?? 0) > 0;
  if (isPaidModel) {
    const allowed = ctx.perms.can(ws, "models:use-any", { selectedModel, gameId });
    if (!allowed) {
      ws.send(
        JSON.stringify({
          type: "error",
          message: "Your account is not allowed to use paid models.",
        }),
      );
      game.lobbySettings.selectedModel = ctx.appConfig.ai.defaultModel;
      ctx.sendLobbySnapshot(ws, gameId);
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
  role: string;
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
  const canUseBrave = role === "admin" || role === "privileged";

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

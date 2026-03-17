import type { GameState } from "../../../types/runtime.js";
import type { CtxDeps } from "../../context.types.js";
import type { WsHandler } from "../types.js";
import { toPlayerPayloads } from "../../../lobby/playerPayloads.js";
import {
  attachPlayerSocket,
  buildGameStatePayload,
  findPlayerByUsername,
  getJoinedPlayer,
  joinPlayerFromProfile,
  normalizeSessionUsername,
  removePlayerFromGame,
} from "../../../game/gameLogic/sessionState.js";

type JoinGameData = { gameId: string; username?: string; displayname?: string };
type LeaveGameData = { gameId: string; username?: string };

type SessionHandlersCtx = CtxDeps<
  | "games"
  | "repos"
  | "broadcast"
  | "checkAllWagersSubmitted"
  | "checkAllDrawingsSubmitted"
>;

export const sessionHandlers: Record<string, WsHandler> = {
  "join-game": async ({ ws, data, ctx }) => {
    const hctx = ctx as SessionHandlersCtx;
    const { gameId, username, displayname } = (data ?? {}) as JoinGameData;
    const normalizedUsername = normalizeSessionUsername(username);

    if (!normalizedUsername) {
      ws.send(JSON.stringify({ type: "error", message: "Username cannot be blank." }));
      return;
    }

    if (!hctx.games?.[gameId]) {
      ws.send(JSON.stringify({ type: "error", message: "Game does not exist!" }));
      return;
    }

    const game = hctx.games[gameId] as GameState;

    const existingPlayer = findPlayerByUsername(game, normalizedUsername);

    if (existingPlayer) {
      console.log(`[Server] Player ${normalizedUsername} reconnected to Game ${gameId}`);
      attachPlayerSocket(existingPlayer, ws.id, displayname);
      ws.gameId = gameId;
    } else {
      const profile = await hctx.repos.profiles.getPublicProfileByUsername(normalizedUsername);
      joinPlayerFromProfile(game, {
        wsId: ws.id,
        username: normalizedUsername,
        displayname,
        profile,
      });
      ws.gameId = gameId;
    }

    const joinedPlayer = getJoinedPlayer(game, {
      wsId: ws.id,
      username: normalizedUsername,
    });
    const gameState = buildGameStatePayload(gameId, game, joinedPlayer);

    ws.send(JSON.stringify(gameState));

    if (gameState.aiHostPlayback?.assetId) {
      ws.send(
        JSON.stringify({
          type: "ai-host-say",
          assetId: gameState.aiHostPlayback.assetId,
          startedAtMs: gameState.aiHostPlayback.startedAtMs,
          durationMs: gameState.aiHostPlayback.durationMs ?? undefined,
          elapsedMs: gameState.aiHostPlayback.elapsedMs,
        }),
      );
    }

    hctx.broadcast(gameId, {
      type: "player-list-update",
      players: toPlayerPayloads(game.players),
      host: game.host,
    });
  },

  "leave-game": async ({ ws, data, ctx }) => {
    const hctx = ctx as SessionHandlersCtx;
    const { gameId, username } = (data ?? {}) as LeaveGameData;
    if (!gameId || !hctx.games?.[gameId]) return;

    const game = hctx.games[gameId] as GameState;
    const leavingPlayer = removePlayerFromGame(
      game,
      normalizeSessionUsername(username),
      ws.id,
    );
    if (!leavingPlayer) return;

    if ((game.players ?? []).length === 0) {
      delete hctx.games[gameId];
      return;
    }

    ws.gameId = null;

    hctx.broadcast(gameId, {
      type: "player-list-update",
      players: toPlayerPayloads(game.players),
      host: game.host,
    });

    hctx.checkAllWagersSubmitted(game, gameId, ctx);
    hctx.checkAllDrawingsSubmitted(game, gameId, ctx);
  },
};

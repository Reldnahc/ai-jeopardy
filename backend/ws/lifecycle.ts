// backend/ws/lifecycle.js
import type { SocketState } from "../types/runtime.js";
import type { Ctx } from "./context.types.js";
import type { PlayerState } from "../types/runtime.js";

/**
 * Handles a socket disconnect in a server-authoritative way.
 * - marks player offline
 * - broadcasts player list update
 * - schedules lobby grace cleanup if applicable
 * - unblocks Final Jeopardy stages if required players disappear
 */
export function handleSocketClose(
  ws: SocketState,
  ctx: Ctx,
  interval: NodeJS.Timeout,
): void {
  try {
    console.log(`WebSocket closed for socket ${ws.id}`);

    clearInterval(interval);

    const gameId = ws.gameId;
    const game = gameId ? ctx.games[gameId] : null;
    if (!game) return;

    const player = game.players?.find((p: PlayerState) => p.id === ws.id);
    if (!player) return;

    if (game.inLobby) {
      console.log(`[Server] Player ${player.name} disconnected in lobby (hard).`);

      const before = game.players.length;
      game.players = game.players.filter((p: PlayerState) => p.id !== ws.id);
      if (game.players.length === before) return;

      const wasHost =
        String(game.host ?? "")
          .trim()
          .toLowerCase() ===
        String(player.username ?? "")
          .trim()
          .toLowerCase();

      if (wasHost) {
        if (game.players.length === 0) {
          ctx.scheduleLobbyCleanupIfEmpty(gameId);
          return;
        }
        game.host = String(game.players[0].username ?? "")
          .trim()
          .toLowerCase();
      }

      ctx.broadcast(gameId, {
        type: "player-list-update",
        players: game.players.map((p: PlayerState) => ({
          username: p.username,
          displayname: p.displayname,
          online: p?.online,
        })),
        host: game.host,
      });

      ctx.scheduleLobbyCleanupIfEmpty(gameId);
      return;
    }

    player.online = false;
    player.id = null; // keeps reconnect logic consistent

    // Broadcast updated list (missing online => true)
    ctx.broadcast(gameId, {
      type: "player-list-update",
      players: game.players.map((p: PlayerState) => ({
        username: p.username,
        displayname: p.displayname,
        online: p?.online,
      })),
      host: game.host,
    });

    console.log(`[Server] Player ${player.name} disconnected (soft).`);

    // Unblock Final Jeopardy if they were required (domain returns events)
    ctx.checkAllWagersSubmitted(game, gameId, ctx);

    ctx.checkAllDrawingsSubmitted(game, gameId, ctx);
  } catch (e) {
    console.error("[WS] close handler error:", e);
  }
}

// backend/ws/lifecycle.js
import {
    checkAllDrawingsSubmitted,
    checkAllWagersSubmitted,
} from "../game/finalJeopardy.js";

/**
 * Handles a socket disconnect in a server-authoritative way.
 * - marks player offline
 * - broadcasts player list update
 * - schedules lobby grace cleanup if applicable
 * - unblocks Final Jeopardy stages if required players disappear
 */
export function handleSocketClose(ws, ctx) {
    try {
        console.log(`WebSocket closed for socket ${ws.id}`);

        const gameId = ws.gameId;
        const game = gameId ? ctx.games[gameId] : null;
        if (!game) return;

        const player = game.players?.find((p) => p.id === ws.id);
        if (!player) return;

        player.online = false;
        player.id = null; // keeps reconnect logic consistent

        // Broadcast updated list (missing online => true)
        ctx.broadcast(gameId, {
            type: "player-list-update",
            players: game.players.map((p) => ({
                name: p.name,
                color: p.color,
                text_color: p.text_color,
                online: p.online !== false,
            })),
            host: game.host,
        });

        if (game.inLobby) {
            console.log(`[Server] Player ${player.name} disconnected in lobby (soft).`);
            ctx.scheduleLobbyCleanupIfEmpty(gameId);
            return;
        }

        console.log(`[Server] Player ${player.name} disconnected (soft).`);

        // Unblock Final Jeopardy if they were required (domain returns events)
        checkAllWagersSubmitted(game, gameId, ctx);

        checkAllDrawingsSubmitted(game);

    } catch (e) {
        console.error("[WS] close handler error:", e);
    }
}

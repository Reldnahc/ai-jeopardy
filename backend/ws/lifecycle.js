// backend/ws/lifecycle.js

/**
 * Handles a socket disconnect in a server-authoritative way.
 * - marks player offline
 * - broadcasts player list update
 * - schedules lobby grace cleanup if applicable
 * - unblocks Final Jeopardy stages if required players disappear
 */
export function handleSocketClose(ws, ctx, interval) {
    try {
        console.log(`WebSocket closed for socket ${ws.id}`);

        clearInterval(interval);

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
                username: p.username,
                displayname: p.displayname,
                online: p?.online,
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
        ctx.checkAllWagersSubmitted(game, gameId, ctx);

        ctx.checkAllDrawingsSubmitted(game, gameId, ctx);

    } catch (e) {
        console.error("[WS] close handler error:", e);
    }
}

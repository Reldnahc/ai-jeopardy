export const lobbyHandlers = {
    "join-lobby": async ({ ws, data, ctx }) => {
        const { gameId } = data;
        if (!gameId) return;

        const game = ctx.games[gameId];
        if (!game) return;

        ws.gameId = gameId;

        // whatever your existing join logic is:
        // - find or create player
        // - set online true
        // - cancel cleanup
        // - broadcast player list update / lobby state snapshot
        ctx.cancelLobbyCleanup(game);

        ctx.sendLobbySnapshot(ws, gameId);
        ctx.broadcast(gameId, {
            type: "player-list-update",
            players: game.players.map((p) => ({
                name: p.name,
                color: p.color,
                text_color: p.text_color,
                online: p?.online !== false,
            })),
            host: game.host,
        });
    },

    "leave-lobby": async ({ ws, data, ctx }) => {
        const { gameId } = data;
        if (!gameId) return;

        const game = ctx.games[gameId];
        if (!game) return;

        // Your current semantics:
        // - only hard remove in lobby
        // - host reassignment if needed
        // - schedule grace cleanup if empty
        // Paste your existing leave logic here.

        ctx.scheduleLobbyCleanupIfEmpty(gameId);
    },

    "promote-host": async ({ ws, data, ctx }) => {
        const { gameId, newHostName } = data;
        if (!gameId || !newHostName) return;

        const game = ctx.games[gameId];
        if (!game) return;

        if (!ctx.requireHost(game, ws)) return;

        const exists = (game.players || []).some((p) => p.name === newHostName);
        if (!exists) return;

        game.host = newHostName;

        ctx.broadcast(gameId, {
            type: "host-update",
            host: game.host,
        });

        // everyone’s lobby UI can re-derive host controls from snapshot
        // (or you can explicitly broadcast a player-list-update too)
        ctx.broadcast(gameId, {
            type: "player-list-update",
            players: game.players.map((p) => ({
                name: p.name,
                color: p.color,
                text_color: p.text_color,
                online: p?.online !== false,
            })),
            host: game.host,
        });
    },
};

import { games } from "../state/gamesStore.js"

export const LOBBY_EMPTY_GRACE_MS = 60_000 * 2; // tune: 30s–120s

export const cancelLobbyCleanup = (game) => {
    if (!game) return;
    if (game.cleanupTimer) clearTimeout(game.cleanupTimer);
    game.cleanupTimer = null;
    game.emptySince = null;
};

export const scheduleLobbyCleanupIfEmpty = (gameId) => {
    const game = games[gameId];
    if (!game) return;

    // "Empty" = nobody online (or no players at all)
    const hasOnline = (game.players || []).some(p => p?.online !== false);
    const isEmpty = !hasOnline;

    if (!isEmpty) {
        cancelLobbyCleanup(game);
        return;
    }

    if (game.cleanupTimer) return; // already scheduled

    game.emptySince = Date.now();
    game.cleanupTimer = setTimeout(() => {
        const g = games[gameId];
        if (!g) return;

        const stillHasOnline = (g.players || []).some(p => p.online);
        if (!stillHasOnline && g.inLobby) {
            delete games[gameId];
            console.log(`[Lobby ${gameId}] cleaned up after grace`);
        } else {
            cancelLobbyCleanup(g);
        }
    }, LOBBY_EMPTY_GRACE_MS);
};

import { games } from "../state/gamesStore.js";
import { normalizeCategories11 } from "../validation/boardImport.js";

export const buildLobbyState = (gameId, ws) => {
    const game = games[gameId];
    if (!game) return null;

    const you = game.players?.find((p) => p.id === ws.id) || null;

    return {
        type: "lobby-state",
        gameId,
        players: game.players.map((p) => ({
            name: p.name,
            color: p.color,
            text_color: p.text_color,
            online: p?.online !== false,
        })),
        host: game.host,
        categories: normalizeCategories11(game.categories),
        lockedCategories: game.lockedCategories,
        inLobby: game.inLobby,
        lobbySettings: game.lobbySettings ?? null,
        isGenerating: Boolean(game.isGenerating),
        isLoading: Boolean(game.isLoading),
        generationProgress: typeof game.generationProgress === "number" ? game.generationProgress : null,
        generationDone: typeof game.generationDone === "number" ? game.generationDone : null,
        generationTotal: typeof game.generationTotal === "number" ? game.generationTotal : null,
        you: you
            ? {
                playerName: you.name,
                playerKey: you.playerKey || null,
                isHost: you.name === game.host,
            }
            : null,
    };
};

export const getPlayerForSocket = (game, ws) => {
    if (!game || !ws) return null;
    return (game.players || []).find((p) => p.id === ws.id) || null;
};

export const sendLobbySnapshot = (ws, gameId) => {
    const snap = buildLobbyState(gameId, ws);
    if (snap) ws.send(JSON.stringify(snap));
};

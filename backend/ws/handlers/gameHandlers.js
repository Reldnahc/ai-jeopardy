export const gameHandlers = {
    "start-game": async ({ ws, data, ctx }) => {
        const { gameId } = data;
        if (!gameId) return;

        const game = ctx.games[gameId];
        if (!game) return;

        if (!ctx.requireHost(game, ws)) return;

        // paste your existing start-game logic here
        // ctx.startGameTimer(...), ctx.broadcast(...), etc.
    },

    "buzz": async ({ ws, data, ctx }) => {
        const { gameId } = data;
        if (!gameId) return;

        const game = ctx.games[gameId];
        if (!game) return;

        // paste your existing buzzer authority logic here
    },
};

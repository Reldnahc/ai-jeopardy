export const userHandlers = {
    "ping": async ({ ws }) => {
        ws.send(JSON.stringify({ type: "pong", t: Date.now() }));
    },
    "check-cotd": async ({ ws, ctx }) => {
        ws.send(JSON.stringify({
            type: "category-of-the-day",
            cotd: ctx.getCOTD(),
        }));
    },
    "request-player-list": async ({ ws, data, ctx }) => {
        const { gameId } = data;
        ws.send(JSON.stringify({
            type: "player-list-update",
            gameId,
            players: ctx.games[gameId].players.map((p) => ({
                name: p.name,
                color: p.color,
                text_color: p.text_color,
            })),
            host: ctx.games[gameId].host,
        }));
    },
};

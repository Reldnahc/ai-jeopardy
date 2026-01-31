export const userHandlers = {
    "ping": async ({ ws }) => {
        ws.send(JSON.stringify({ type: "pong", t: Date.now() }));
    },
    "auth": async ({ ws, data, ctx }) => {
        const accessToken = data?.accessToken;

        const user = await ctx.verifySupabaseAccessToken(accessToken);
        if (!user) {
            ws.auth = { isAuthed: false, userId: null, role: "default" };
            ws.send(JSON.stringify({ type: "auth-result", ok: false }));
            return;
        }

        const role = await ctx.getRoleForUserId(user.id);

        ws.auth = {
            isAuthed: true,
            userId: user.id,
            role,
        };

        ws.send(JSON.stringify({
            type: "auth-result",
            ok: true,
            role,
            userId: user.id,
        }));
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

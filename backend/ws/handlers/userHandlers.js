export const userHandlers = {
    "ping": async ({ ws }) => {
        ws.send(JSON.stringify({ type: "pong", t: Date.now() }));
    },
};

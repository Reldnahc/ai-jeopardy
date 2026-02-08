export const makeBroadcaster = (wss) => {
    const broadcast = (gameId, payload) => {
        const msg = JSON.stringify(payload);
        for (const client of wss.clients) {
            if (client.readyState !== 1) continue;
            if (client.gameId !== gameId) continue;

            try {
                client.send(msg);
            } catch {
                // ignore
            }
        }
    };

    const broadcastAll = (payload) => {
        const msg = JSON.stringify(payload);
        for (const client of wss.clients) {
            if (client.readyState !== 1) continue;
            try {
                client.send(msg);
            } catch {
                // ignore
            }
        }
    };

    return { broadcast, broadcastAll };
};

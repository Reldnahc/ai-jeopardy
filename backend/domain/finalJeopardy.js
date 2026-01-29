function getExpectedFinalists(game) {
    const players = Array.isArray(game?.players) ? game.players : [];

    return players.filter((p) => {
        const score = Number(p?.score ?? 0);
        const online = p?.online !== false; // default true if missing
        return score > 0 && online;
    });
}

export function checkAllWagersSubmitted(game) {
    if (!game?.isFinalJeopardy) return null;
    if (game.finalJeopardyStage !== "wager") return null;

    const expected = getExpectedFinalists(game).map((p) => p.name);
    const wagers = game.wagers || {};

    const allSubmitted =
        expected.length === 0 ||
        expected.every((name) =>
            Object.prototype.hasOwnProperty.call(wagers, name)
        );

    if (!allSubmitted) return null;

    game.finalJeopardyStage = "drawing";

    return { type: "all-wagers-submitted", wagers };
}

export function checkAllFinalDrawingsSubmitted(game) {
    if (!game?.isFinalJeopardy) return null;
    if (game.finalJeopardyStage !== "drawing") return null;

    const expected = getExpectedFinalists(game).map((p) => p.name);
    const drawings = game.drawings || {};

    const allSubmitted =
        expected.length === 0 ||
        expected.every((name) =>
            Object.prototype.hasOwnProperty.call(drawings, name)
        );

    if (!allSubmitted) return null;

    game.finalJeopardyStage = "done";

    return { type: "all-final-jeopardy-drawings-submitted", drawings };
}

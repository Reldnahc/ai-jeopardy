export function isBoardFullyCleared(game, boardKey) {
    const board = game?.boardData?.[boardKey];
    if (!board?.categories) return false;

    for (const cat of board.categories) {
        for (const clue of cat.values || []) {
            const clueId = `${clue.value}-${clue.question}`;
            if (!game.clearedClues?.has(clueId)) return false;
        }
    }
    return true;
}

export function checkBoardTransition(game, gameId, ctx) {
    if (game.activeBoard === "firstBoard") {
        if (!ctx.isBoardFullyCleared(game, "firstBoard")) return;


        void startDoubleJeopardy(game, gameId, ctx);
        return;
    }

    if (game.activeBoard === "secondBoard") {
        if (!ctx.isBoardFullyCleared(game, "secondBoard")) return;

        startFinalJeopardy(game, gameId, ctx);
    }
}

async function startDoubleJeopardy(game, gameId, ctx) {
    ctx.broadcast(gameId, {
        type: "phase-changed",
        phase: "transition",
        selectorKey: game.selectorKey ?? null,
        selectorName: game.selectorName ?? null,
    });

    game.activeBoard = "secondBoard";

    const pad = 200;
    const players = game.players ?? [];
    const pick =
        players.length === 0
            ? null
            : players.reduce((lowest, p) => {
                const score = game.scores?.[p.name] ?? 0;
                const lowestScore = game.scores?.[lowest.name] ?? 0;

                return score < lowestScore ? p : lowest;
            });
    // Set them as selector
    if (pick) {
        game.selectorKey = pick.playerKey;
        game.selectorName = pick.name;
    } else {
        game.selectorKey = null;
        game.selectorName = null;
    }
    const selectorName = String(game.selectorName ?? "").trim();

    //TODO Verify everyone made it.
    await ctx.aiHostVoiceSequence(ctx, gameId, game, [
        {slot: "double_jeopardy", pad},
        {slot: "double_jeopardy2", pad, after: () => ctx.broadcast(gameId, {type: "transition-to-second-board"}) },
        {slot: selectorName, pad},
        {slot: "your_up", pad},
    ]);

    ctx.broadcast(gameId, {
        type: "phase-changed",
        phase: "board",
        selectorKey: game.selectorKey ?? null,
        selectorName: game.selectorName ?? null,
    });
}

async function startFinalJeopardy(game, gameId, ctx) {
    game.activeBoard = "finalJeopardy";
    game.isFinalJeopardy = true;
    game.finalJeopardyStage = "wager";

    const pad = 200;

    await ctx.aiHostVoiceSequence(ctx, gameId, game, [
        {slot: "final_jeopardy", pad},
        {slot: "final_jeopardy2", pad},
        //{slot: "", pad, after: null},
    ]);


    game.wagers = {};
    game.drawings = {};

    ctx.broadcast(gameId, {type: "final-jeopardy"});
}
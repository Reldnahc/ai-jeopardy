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

    const saidA = await ctx.aiHostSayRandomFromSlot(gameId, game, "double_jeopardy", ctx);
    const msA = saidA?.ms ?? 0;
    await ctx.sleep(msA + pad);

    const saidB = await ctx.aiHostSayRandomFromSlot(gameId, game, "double_jeopardy2", ctx);
    const msB = saidB?.ms ?? 0;
    await ctx.sleep(msB);

    // Pick the player with the lowest score
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

    ctx.broadcast(gameId, {type: "transition-to-second-board"});
    //TODO Verify everyone made it.

    const selectorName = String(game.selectorName ?? "").trim();
    await ctx.sleep(pad);

    const saidC = await ctx.aiHostSayPlayerName(gameId, game, selectorName, ctx);
    const msC = saidC?.ms ?? 0;
    await ctx.sleep(msC + pad / 2);

    const saidD = await ctx.aiHostSayRandomFromSlot(gameId, game, "your_up", ctx);
    const msD = saidD?.ms ?? 0;
    await ctx.sleep(msD);

    ctx.broadcast(gameId, {
        type: "phase-changed",
        phase: "board",
        selectorKey: game.selectorKey ?? null,
        selectorName: game.selectorName ?? null,
    });
}


function startFinalJeopardy(game, gameId, ctx) {
    game.activeBoard = "finalJeopardy";
    game.isFinalJeopardy = true;
    game.finalJeopardyStage = "wager";

    game.wagers = {};
    game.drawings = {};

    ctx.broadcast(gameId, { type: "final-jeopardy" });
}
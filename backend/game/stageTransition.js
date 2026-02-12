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

    if (pick) {
        game.selectorKey = pick.playerKey;
        game.selectorName = pick.name;
    } else {
        game.selectorKey = null;
        game.selectorName = null;
    }
    const selectorName = String(game.selectorName ?? "").trim();

    await ctx.aiHostVoiceSequence(ctx, gameId, game, [
        { slot: "double_jeopardy", pad },
        { slot: "double_jeopardy2", pad, after: () => ctx.broadcast(gameId, { type: "transition-to-second-board" }) },
        { slot: selectorName, pad },
        { slot: "your_up", pad },
    ]);

    ctx.broadcast(gameId, {
        type: "phase-changed",
        phase: "board",
        selectorKey: game.selectorKey ?? null,
        selectorName: game.selectorName ?? null,
    });
}

function getExpectedFinalists(game) {
    const players = Array.isArray(game?.players) ? game.players : [];
    return players.filter((p) => {
        const score = Number(game.scores?.[p.name] ?? 0);
        const online = p?.online !== false; // default true
        return score > 0 && online;
    });
}

async function startFinalJeopardy(game, gameId, ctx) {
    game.activeBoard = "finalJeopardy";
    game.isFinalJeopardy = true;
    game.finalJeopardyStage = "wager";

    game.wagers = {};
    game.drawings = {};

    const pad = 200;

    await ctx.aiHostVoiceSequence(ctx, gameId, game, [
        { slot: "final_jeopardy", pad },
        { slot: "final_jeopardy2", pad, after: () => ctx.broadcast(gameId, { type: "final-jeopardy" }) },
        { slot: "all_wager", pad },
    ]);

    const WAGER_SECONDS = 30;

    ctx.startGameTimer(gameId, game, ctx, WAGER_SECONDS, "final-wager", () => {
        // Only act if we’re still in FJ wager stage
        if (!game?.isFinalJeopardy) return;
        if (game.finalJeopardyStage !== "wager") return;

        const expected = getExpectedFinalists(game).map((p) => p.name);
        if (!game.wagers) game.wagers = {};

        // If player didn't submit, wager defaults to 0
        for (const name of expected) {
            if (!Object.prototype.hasOwnProperty.call(game.wagers, name)) {
                game.wagers[name] = 0;
            }
        }

        // This will advance to drawing phase (and start the next timer there)
        // (finalJeopardy.js handles the transition when all wagers exist)
        // We can just broadcast the same message type your clients already handle:
        ctx.broadcast(gameId, { type: "all-wagers-submitted", wagers: game.wagers });
        game.finalJeopardyStage = "drawing";

        // Let finalJeopardy.js do the clue-selected broadcast via its normal flow:
        // Easiest: call the existing transition helper by reusing the same logic:
        // We’ll simply trigger the normal check path by importing it elsewhere — but
        // since this file is isolated, we rely on finalJeopardy.js’s own checks
        // when submit-wager messages arrive normally.
        //
        // However, to keep behavior consistent, we’ll also set up the clue now:
        const fjCat = game.boardData?.finalJeopardy?.categories?.[0] || null;
        const fjClueRaw = fjCat?.values?.[0] || null;

        if (!fjClueRaw) {
            console.error("[FinalJeopardy] Missing final clue in boardData");
            return;
        }

        game.selectedClue = {
            value: typeof fjClueRaw.value === "number" ? fjClueRaw.value : 0,
            question: String(fjClueRaw.question || ""),
            answer: String(fjClueRaw.answer || ""),
            isAnswerRevealed: false,
            media: fjClueRaw.media || undefined,
            category: String(fjCat?.category || "").trim() || undefined,
        };

        game.phase = "clue";
        game.buzzerLocked = true;
        game.buzzed = null;
        game.buzzLockouts = {};
        ctx.broadcast(gameId, { type: "buzzer-locked" });
        ctx.broadcast(gameId, { type: "buzzer-ui-reset" });

        ctx.broadcast(gameId, {
            type: "clue-selected",
            clue: game.selectedClue,
            clearedClues: Array.from(game.clearedClues || []),
        });

        // Start the 30s drawing timer now (same as finalJeopardy.js will do)
        const DRAW_SECONDS = 30;
        ctx.startGameTimer(gameId, game, ctx, DRAW_SECONDS, "final-draw", () => {
            if (!game?.isFinalJeopardy) return;
            if (game.finalJeopardyStage !== "drawing") return;

            const expected2 = getExpectedFinalists(game).map((p) => p.name);
            if (!game.drawings) game.drawings = {};
            if (!game.finalVerdicts) game.finalVerdicts = {};
            if (!game.finalTranscripts) game.finalTranscripts = {};

            for (const name of expected2) {
                if (!Object.prototype.hasOwnProperty.call(game.drawings, name)) {
                    game.drawings[name] = "";
                    game.finalVerdicts[name] = "incorrect";
                    game.finalTranscripts[name] = "";
                }
            }

            // If everyone is now “submitted”, let the normal finish path run by broadcasting:
            ctx.broadcast(gameId, { type: "all-drawings-submitted", drawings: game.drawings });
            game.finalJeopardyStage = "finale";
        });
    });
}

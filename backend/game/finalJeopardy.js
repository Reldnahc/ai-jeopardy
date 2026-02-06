function getExpectedFinalists(game) {

    const players = Array.isArray(game?.players) ? game.players : [];

    return players.filter((p) => {
        const score = Number(game.scores[p.name] ?? 0);
        const online = p?.online !== false; // default true if missing
        return score > 0 && online;
    });
}

function advanceToDrawingPhase(game, gameId, wagers, ctx) {
    game.finalJeopardyStage = "drawing";

    ctx.broadcast(gameId, { type: "all-wagers-submitted", wagers });

    // Reveal the final clue immediately after wagers are locked in
    const fjCat = game.boardData?.finalJeopardy?.categories?.[0] || null;
    const fjClueRaw = fjCat?.values?.[0] || null;
    if (!fjClueRaw) {
        console.error("[FinalJeopardy] Missing final clue in boardData");
        return;
    }
    // Ensure it matches your client Clue shape (needs `value`)
    game.selectedClue = {
        value: typeof fjClueRaw.value === "number" ? fjClueRaw.value : 0,
        question: String(fjClueRaw.question || ""),
        answer: String(fjClueRaw.answer || ""),
        isAnswerRevealed: false,
        media: fjClueRaw.media || undefined,
        category: String(fjCat?.category || "").trim() || undefined,
    };

    game.phase = "clue";
    // Final Jeopardy shouldn't use the buzzer
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

}

function advanceToFinalePhase(game, gameId, drawings, ctx) {
    game.finalJeopardyStage = "finale";
    ctx.broadcast(gameId, { type: "all-drawings-submitted", drawings });

    game.selectedClue.isAnswerRevealed = true;
    ctx.broadcast(gameId, { type: "answer-revealed", clue: game.selectedClue });

    const wagers = game.wagers;
    const verdicts = game.finalVerdicts;
    const transcripts = game.finalTranscripts;
    const scores = game.scores;

    for (const player of game.players) {
        const name = player.name;
        const verdict = verdicts[name];
        if (verdict === "correct"){
            scores[name] += wagers[name];
            continue;
        }
        scores[name] -= wagers[name];
    }

    ctx.broadcast(gameId, { type: "update-scores", scores: game.scores });
    ctx.broadcast(gameId, { type: "final-score-screen" });
}

export async function submitDrawing(game, gameId, player, drawing, ctx) {
    if (!game.drawings) {
        game.drawings = {};
    }

    game.drawings[player] = drawing;

    if (!game.finalVerdicts) {
        game.finalVerdicts = {};
    }
    if (!game.finalTranscripts) {
        game.finalTranscripts = {};
    }

    const {verdict, transcript} = await ctx.judgeImage(game.selectedClue?.answer, drawing);
    game.finalVerdicts[player] = verdict;
    game.finalTranscripts[player] = transcript;

    checkAllDrawingsSubmitted(game, gameId, ctx);
}

export function submitWager(game, gameId, player, wager, ctx) {
    if (!game.wagers) {
        game.wagers = {};
    }
    game.wagers[player] = wager;

    checkAllWagersSubmitted(game, gameId, ctx);
}

export function checkAllWagersSubmitted(game, gameId, ctx) {
    if (!game?.isFinalJeopardy) return;
    if (game.finalJeopardyStage !== "wager") return;

    const expected = getExpectedFinalists(game).map((p) => p.name);
    const wagers = game.wagers || {};

    console.log(wagers);
    console.log(expected);

    const allSubmitted =
        expected.length === 0 ||
        expected.every((name) =>
            Object.prototype.hasOwnProperty.call(wagers, name)
        );

    if (allSubmitted) {
        advanceToDrawingPhase(game, gameId, wagers, ctx);
    }
}

export function checkAllDrawingsSubmitted(game, gameId, ctx) {
    if (!game?.isFinalJeopardy) return null;
    if (game.finalJeopardyStage !== "drawing") return null;

    const expected = getExpectedFinalists(game).map((p) => p.name);
    const drawings = game.drawings || {};

    const allSubmitted =
        expected.length === 0 ||
        expected.every((name) =>
            Object.prototype.hasOwnProperty.call(drawings, name)
        );

    if (allSubmitted) {
        advanceToFinalePhase(game, gameId, drawings, ctx);
    }
}

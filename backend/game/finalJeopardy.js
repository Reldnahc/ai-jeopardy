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

async function finishGame(game, gameId, drawings, ctx) {
    game.finalJeopardyStage = "finale";
    ctx.broadcast(gameId, {type: "all-drawings-submitted", drawings});

    await ctx.sleep(5_000); //5 secs just clue
    game.selectedClue.isAnswerRevealed = true;
    ctx.broadcast(gameId, {type: "answer-revealed", clue: game.selectedClue});

    const wagers = game.wagers;
    const verdicts = game.finalVerdicts;
    const scores = game.scores;

    for (const player of game.players) {
        const name = player.name;
        const verdict = verdicts[name];

        if (verdict === "correct") {
            scores[name] += wagers[name];
            continue;
        }

        scores[name] -= wagers[name];
    }
    await ctx.sleep(5_000);//5 secs with answer

    const top = Object.entries(scores)
        .map(([name, score]) => ({ name, score }))
        .sort((a, b) => b.score - a.score)
        .slice(0, 3);

    for (let i = top.length - 1; i >= 0; i--) {
        ctx.broadcast(gameId, {type: "display-finalist", finalist: top[i].name});
        await ctx.sleep(5_000);//5 secs on each finalist
        ctx.broadcast(gameId, {type: "update-score", player: top[i].name, score: top[i].score});
        await ctx.sleep(5_000);//5 secs on each finalist score update
    }

    const fireAndForget = (p, label) => {
        Promise.resolve(p).catch((err) => {
            console.error(`[bg:${label}]`, err);
        });
    };

    const finalScores = Object.fromEntries(game.players.map((p) => [p.name, 0]));

    if (top[0]) finalScores[top[0].name] = top[0].score;
    if (top[1]) finalScores[top[1].name] = 3000;
    if (top[2]) finalScores[top[2].name] = 2000;

    game.scores = finalScores;

    const usernames = new Set();
    for (const p of game.players) usernames.add(ctx.normalizeName(p.name));
    for (const p of top.slice(0, 3)) if (p) usernames.add(ctx.normalizeName(p.name));

    const idByUsername = new Map();
    await Promise.all(
        [...usernames].map(async (u) => {
            const id = await ctx.repos.profiles.getIdByUsername(u);
            idByUsername.set(u, id);
        })
    );

    if (top[0]) {
        const id = idByUsername.get(ctx.normalizeName(top[0].name));
        if (id) {
            fireAndForget(ctx.repos.profiles.incrementGamesWon(id), "incrementGamesWon");
            fireAndForget(ctx.repos.profiles.addMoneyWon(id, top[0].score), "addMoneyWon:winner");
        }
    }

    if (top[1]) {
        const id = idByUsername.get(ctx.normalizeName(top[1].name));
        if (id) {
            fireAndForget(ctx.repos.profiles.addMoneyWon(id, 3000), "addMoneyWon:second");
        }
    }

    if (top[2]) {
        const id = idByUsername.get(ctx.normalizeName(top[2].name));
        if (id) {
            fireAndForget(ctx.repos.profiles.addMoneyWon(id, 2000), "addMoneyWon:third");
        }
    }

    // 4) Fire-and-forget: everyone finished
    for (const p of game.players) {
        const id = idByUsername.get(ctx.normalizeName(p.name));
        if (!id) continue;
        fireAndForget(ctx.repos.profiles.incrementGamesFinished(id), "incrementGamesFinished");
    }

    //update all the scores.
    ctx.broadcast(gameId, {type: "update-scores", scores: game.scores});
    ctx.broadcast(gameId, {type: "final-score-screen"});
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
        void finishGame(game, gameId, drawings, ctx);
    }
}

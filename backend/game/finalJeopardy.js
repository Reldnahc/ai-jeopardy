import {appConfig} from "../config/appConfig.js";

function getExpectedFinalists(game) {
    const players = Array.isArray(game?.players) ? game.players : [];

    return players.filter((p) => {
        const score = Number(game.scores[p.username] ?? 0);
        const online = p?.online !== false; // default true if missing
        return score > 0 && online;
    });
}

function getFinalistUsernames(game) {
    if (Array.isArray(game?.finalJeopardyFinalists)) return game.finalJeopardyFinalists;
    const names = getExpectedFinalists(game).map((p) => p.username);
    game.finalJeopardyFinalists = names;
    return names;
}

async function advanceToDrawingPhase(game, gameId, wagers, ctx) {
    // ✅ stop wager timer once complete
    ctx.clearGameTimer(game, gameId, ctx);

    game.finalJeopardyStage = "drawing";

    // ✅ include finalists so clients can hide drawing UI for non-finalists
    const finalists = getFinalistUsernames(game);
    ctx.broadcast(gameId, {type: "all-wagers-submitted", wagers, finalists});

    // Reveal the final clue immediately after wagers are locked in
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
    ctx.broadcast(gameId, {type: "buzzer-locked"});
    ctx.broadcast(gameId, {type: "buzzer-ui-reset"});

    const selectClue = () => {
        ctx.broadcast(gameId, {
            type: "clue-selected",
            clue: game.selectedClue,
            clearedClues: Array.from(game.clearedClues || []),
            // ✅ include finalists here too (some clients show drawing UI on clue-selected)
            finalists: getFinalistUsernames(game),
        });
    };

    const pad = 25;

    const DRAW_SECONDS = appConfig.gameplay.drawSeconds;

    const assetId =
        game.boardData?.ttsByClueKey?.[`finalJeopardy:?:${game.selectedClue.question?.trim()}`] || null;

    const alive = await ctx.aiHostVoiceSequence(ctx, gameId, game, [
        {slot: "todays_clue", pad, after: selectClue},
        {assetId, pad},
        {slot: "you_have", pad},
        // tODO TIME SUPPORT
    ]);
    if (!alive) return;

    ctx.startGameTimer(gameId, game, ctx, DRAW_SECONDS, "final-draw", () => {
        if (!game?.isFinalJeopardy) return;
        if (game.finalJeopardyStage !== "drawing") return;

        const expected = getFinalistUsernames(game);

        if (!game.drawings) game.drawings = {};
        if (!game.finalVerdicts) game.finalVerdicts = {};
        if (!game.finalTranscripts) game.finalTranscripts = {};

        // Anyone missing gets a blank (incorrect)
        for (const username of expected) {
            if (!Object.prototype.hasOwnProperty.call(game.drawings, username)) {
                game.drawings[username] = "";
                game.finalVerdicts[username] = "incorrect";
                game.finalTranscripts[username] = "";
            }
        }

        checkAllDrawingsSubmitted(game, gameId, ctx);
    });
}

async function finishGame(game, gameId, drawings, ctx) {
    ctx.clearGameTimer(game, gameId, ctx);

    game.finalJeopardyStage = "finale";
    ctx.broadcast(gameId, { type: "all-drawings-submitted", drawings });
    const pad = 25;

    const wagers = game.wagers;
    const verdicts = game.finalVerdicts;
    const scores = game.scores;

    for (const player of game.players) {
        const username = player.username;

        const score = Number(scores[username] ?? 0);
        const wager = Number(wagers[username] ?? 0);

        if (verdicts[username] === "correct") {
            scores[username] = score + wager;
            ctx.fireAndForget(ctx.repos.profiles.incrementFinalJeopardyCorrects(username),"Increment FJ correct");
        } else {
            scores[username] = score - wager;
        }

    }

    const top = Object.entries(scores)
        .map(([username, score]) => {
            const player = game.players.find(p => p.username === username);

            return {
                username,
                displayname: player?.displayname ?? username,
                score: Number(score)
            };
        })
        .sort((a, b) => b.score - a.score)
        .slice(0, 3);

    console.log(top);

    let alive = await ctx.aiHostVoiceSequence(ctx, gameId, game, [{ slot: "final_jeopardy_finale", pad }]);
    if (!alive) return;

    for (let i = top.length - 1; i >= 0; i--) {
        const username = top[i].username;
        const displayname = top[i].displayname;

        console.log(scores);
        if (!scores[username] || scores[username] <= 0) continue;

        const maybeRevealAnswer = () => {
            if (verdicts[username] === "correct" && !game.selectedClue.isAnswerRevealed) {
                game.selectedClue.isAnswerRevealed = true;
                ctx.broadcast(gameId, { type: "answer-revealed", clue: game.selectedClue });
            }
        };

        const updateScore = async () => {
            ctx.broadcast(gameId, { type: "update-score", username: username, score: top[i].score });
        };

        const revealWager = async () => {
            ctx.broadcast(gameId, { type: "reveal-finalist-wager"});
        };

        ctx.broadcast(gameId, { type: "display-finalist", finalist: username });

        const wager = Number(game.wagers[username] ?? 0);
        const sizeSuffix = wager > 5000 ? "lg" : "sm";
        const followupSlot = verdicts[username] + "_followup_" + sizeSuffix;

        alive = await ctx.aiHostVoiceSequence(ctx, gameId, game, [
            { slot: "final_jeopardy_finale2", pad },
            { slot: displayname, pad },
            { slot: "fja" + displayname, pad, after: maybeRevealAnswer },
            { slot: verdicts[username], pad },
            { slot: "their_wager_was", pad, after: revealWager },
            { slot: "fjw" + displayname, pad, after: updateScore },
            { slot: followupSlot, pad },
        ]);
        if (!alive) return;
    }

    if (!game.selectedClue.isAnswerRevealed) {
        alive = await ctx.aiHostVoiceSequence(ctx, gameId, game, [{ slot: "nobody_final_jeopardy", pad }]);
        if (!alive) return;
        game.selectedClue.isAnswerRevealed = true;
        ctx.broadcast(gameId, { type: "answer-revealed", clue: game.selectedClue });
    }

    if (top[0]) {
        alive = await ctx.aiHostVoiceSequence(ctx, gameId, game, [
            { slot: "final_jeopardy_end", pad },
            { slot: top[0].displayname, pad },
            { slot: "final_jeopardy_end2", pad },
        ]);
        if (!alive) return;
    }

    const finalScores = Object.fromEntries(game.players.map((p) => [p.username, 0]));

    if (top[0]) finalScores[top[0].username] = top[0].score > 3000 ? top[0].score : 3000;
    if (top[1]) finalScores[top[1].username] = 3000;
    if (top[2]) finalScores[top[2].username] = 2000;

    game.scores = finalScores;

    const usernames = new Set();
    for (const p of game.players) usernames.add(ctx.normalizeName(p.username));
    for (const p of top.slice(0, 3)) if (p) usernames.add(ctx.normalizeName(p.username));

    const idByUsername = new Map();
    await Promise.all(
        [...usernames].map(async (u) => {
            const id = await ctx.repos.profiles.getIdByUsername(u);
            idByUsername.set(u, id);
        })
    );

    if (top[0]) {
        const id = idByUsername.get(ctx.normalizeName(top[0].username));
        if (id) {
            ctx.fireAndForget(ctx.repos.profiles.incrementGamesWon(id), "incrementGamesWon");
            ctx.fireAndForget(ctx.repos.profiles.addMoneyWon(id, top[0].score), "addMoneyWon:winner");
        }
    }

    if (top[1]) {
        const id = idByUsername.get(ctx.normalizeName(top[1].username));
        if (id) {
            ctx.fireAndForget(ctx.repos.profiles.addMoneyWon(id, 3000), "addMoneyWon:second");
        }
    }

    if (top[2]) {
        const id = idByUsername.get(ctx.normalizeName(top[2].username));
        if (id) {
            ctx.fireAndForget(ctx.repos.profiles.addMoneyWon(id, 2000), "addMoneyWon:third");
        }
    }

    for (const p of game.players) {
        const id = idByUsername.get(ctx.normalizeName(p.username));
        if (!id) continue;
        ctx.fireAndForget(ctx.repos.profiles.incrementGamesFinished(id), "incrementGamesFinished");
    }

    ctx.broadcast(gameId, { type: "update-scores", scores: game.scores });
    ctx.broadcast(gameId, { type: "final-score-screen" });
}

export async function submitDrawing(game, gameId, player, drawing, ctx) {
    // ✅ Ignore drawings from non-finalists (score <= 0, offline, etc.)
    const expected = getFinalistUsernames(game);
    if (!expected.includes(player)) return;

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

    const { verdict, transcript } = await ctx.judgeImage(game.selectedClue?.answer, drawing);
    game.finalVerdicts[player] = verdict;
    game.finalTranscripts[player] = transcript;
    void ctx.ensureFinalJeopardyAnswer(ctx, game, gameId, player, transcript);

    checkAllDrawingsSubmitted(game, gameId, ctx);
}

export function submitWager(game, gameId, player, wager, ctx) {
    // ✅ Ignore wagers from non-finalists
    const expected = getFinalistUsernames(game);
    if (!expected.includes(player)) return;

    ctx.fireAndForget(ctx.repos.profiles.incrementFinalJeopardyParticipations(player), "Increment final jeopardy Participation");

    if (!game.wagers) {
        game.wagers = {};
    }
    game.wagers[player] = wager;
    ctx.fireAndForget(ctx.ensureFinalJeopardyWager(ctx, game, gameId, player, Number(wager)), "Ensuring final jeopardy wager");

    checkAllWagersSubmitted(game, gameId, ctx);
}

export function checkAllWagersSubmitted(game, gameId, ctx) {
    if (!game?.isFinalJeopardy) return;
    if (game.finalJeopardyStage !== "wager") return;

    const expected = getFinalistUsernames(game);
    const wagers = game.wagers || {};

    const allSubmitted =
        expected.length === 0 ||
        expected.every((name) => Object.prototype.hasOwnProperty.call(wagers, name));

    if (allSubmitted) {
        void advanceToDrawingPhase(game, gameId, wagers, ctx);
    }
}

export function checkAllDrawingsSubmitted(game, gameId, ctx) {
    if (!game?.isFinalJeopardy) return null;
    if (game.finalJeopardyStage !== "drawing") return null;

    const expected = getFinalistUsernames(game);
    const drawings = game.drawings || {};

    const allSubmitted =
        expected.length === 0 ||
        expected.every((name) => Object.prototype.hasOwnProperty.call(drawings, name));

    if (allSubmitted) {
        void finishGame(game, gameId, drawings, ctx);
    }
}

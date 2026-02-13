
function makeSessionId() {
    return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}
export function clearDdWagerTimer(ctx, gameId, game) {
    if (game._ddWagerTimer) {
        clearTimeout(game._ddWagerTimer);
    }
    game._ddWagerTimer = null;
    ctx.broadcast(gameId, {
        type: "timer-end",
        timerVersion: ctx.games[gameId]?.timerVersion || 0
    });
}

function armDdWagerTimer(gameId, game, ctx, ddWagerSessionId, durationMs) {
    clearDdWagerTimer(ctx, gameId, game);

    console.log("[DD] armDdWagerTimer", { gameId, ddWagerSessionId, durationMs });

    const PAD_MS = 250;

    game._ddWagerTimer = setTimeout(async () => {
        console.log("[DD] wager timer fired", { gameId, ddWagerSessionId });

        const g = ctx.games?.[gameId];
        if (!g?.dailyDouble) return;
        if (g.phase !== "DD_WAGER_CAPTURE") return;
        if (g.ddWagerSessionId !== ddWagerSessionId) return;
        if (g.dailyDouble.wager != null) return;

        await repromptDdWager(gameId, g, ctx, { reason: "timeout" });
    }, durationMs + PAD_MS);
}


export async function repromptDdWager(gameId, game, ctx, args) {
    const dd = game.dailyDouble;
    if (!dd) return;

    const maxAttempts = 10;
    dd.attempts = (dd.attempts || 0) + 1;

    // If we’ve tried enough, choose a fallback and continue
    if (dd.attempts > maxAttempts) {
        clearDdWagerTimer(ctx, gameId, game);
        const fallbackWager = 0; // or dd.maxWager if you prefer “all in” default
        dd.wager = fallbackWager;
        dd.stage = "clue";

        game.phase = "clue";
        game.ddWagerSessionId = null;
        game.ddWagerDeadlineAt = null;

        ctx.broadcast(gameId, {
            type: "daily-double-wager-locked",
            gameId,
            playerName: dd.playerName,
            wager: fallbackWager,
            fallback: true,
            reason: args?.reason || "parse-failed",
        });

        return await finalizeDailyDoubleWagerAndStartClue(gameId, game, ctx, {
            playerName: dd.playerName,
            fallbackWager,
            fallback: false,
            reason: null,
        });
    }

    // Tell table what happened (optional)
    ctx.broadcast(gameId, {
        type: "daily-double-wager-parse-failed",
        gameId,
        playerName: dd.playerName,
        reason: args?.reason || "no-number",
        attempts: dd.attempts,
        maxAttempts,
    });

    // Voice reprompt (keep it short)
    await ctx.aiHostVoiceSequence(ctx, gameId, game, [
        { slot: "i_didnt_catch_that", pad: 25 },
        { slot: "say_wager_again", pad: 25 },
    ]);

    // Restart capture with a new session id (prevents stale audio blobs)
    startDdWagerCapture(gameId, game, ctx);
}

export function startDdWagerCapture(gameId, game, ctx, opts = {}) {
    const dd = game.dailyDouble;
    if (!dd) return;

    if (typeof dd.attempts !== "number") dd.attempts = 0;

    const durationMs = 10000;
    const deadlineAt = Date.now() + durationMs;
    const ddWagerSessionId = makeSessionId();

    dd.stage = "wager_listen";
    dd.wager = null;
    dd.ddWagerSessionId = ddWagerSessionId;
    dd.ddWagerDeadlineAt = deadlineAt;

    game.phase = "DD_WAGER_CAPTURE";
    game.ddWagerSessionId = ddWagerSessionId;
    game.ddWagerDeadlineAt = deadlineAt;

    clearDdWagerTimer(ctx, gameId, game);
    armDdWagerTimer(gameId, game, ctx, ddWagerSessionId, durationMs);

    ctx.broadcast(gameId, {
        type: "daily-double-wager-capture-start",
        gameId,
        ddWagerSessionId,
        playerName: dd.playerName,
        durationMs,
        deadlineAt,
        attempts: dd.attempts,
    });

    ctx.startGameTimer(gameId, game, ctx, Math.ceil(durationMs / 1000), "wager");
}

function parseValueAsNumber(val) {
    const n = Number(String(val || "").replace(/[^0-9]/g, ""));
    return Number.isFinite(n) ? n : 0;
}

function computeBoardMax(game, boardKey) {
    const board = game.boardData?.[boardKey];
    let max = 0;
    for (const cat of board?.categories || []) {
        for (const clue of cat?.values || []) {
            const v = parseValueAsNumber(clue?.value);
            if (v > max) max = v;
        }
    }
    return max || 0;
}

export function computeDailyDoubleMaxWager(game, boardKey, playerName) {
    const boardMax = computeBoardMax(game, boardKey);
    const score = Number(game.scores?.[playerName] || 0);
    // Jeopardy rule: max is max(boardMax, score); if score negative, still boardMax
    return Math.max(boardMax, score, 0);
}

export async function finalizeDailyDoubleWagerAndStartClue(
    gameId,
    game,
    ctx,
    args
) {
    const { playerName, wager, fallback = false, reason = null } = args || {};

    const dd = game.dailyDouble;
    if (!dd) return;

    // Lock wager + mark DD used
    dd.wager = Number(wager || 0);
    dd.stage = "clue";

    if (!game.usedDailyDoubles) game.usedDailyDoubles = new Set();
    game.usedDailyDoubles.add(dd.clueKey);

    // Exit wager capture phase (important to prevent lockups / stale audio)
    game.phase = "clue";
    game.ddWagerSessionId = null;
    game.ddWagerDeadlineAt = null;

    // Clear any DD wager timer + end any UI timer
    ctx.clearDdWagerTimer(ctx, gameId, game);

    // Let clients know wager is locked (works for both normal + fallback)
    ctx.broadcast(gameId, {
        type: "daily-double-wager-locked",
        gameId,
        playerName: playerName || dd.playerName,
        wager: dd.wager,
        fallback: Boolean(fallback),
        reason: reason || null,
    });

    // Reveal clue UI in a consistent way (no unlock buzzer in DD)
    ctx.broadcast(gameId, { type: "buzzer-ui-reset" });
    ctx.broadcast(gameId, { type: "buzzer-locked" });
    ctx.broadcast(gameId, {
        type: "clue-selected",
        clue: game.selectedClue,
        clearedClues: Array.from(game.clearedClues),
    });

    // Read the clue (DD path: don't unlock buzzer)
    const clueKey = dd.clueKey;
    const ttsAssetId = game.boardData?.ttsByClueKey?.[clueKey] || null;

    await ctx.aiHostVoiceSequence(ctx, gameId, game, [
        { slot: `for ${dd.wager}`, pad: 25 },
        { assetId: ttsAssetId, pad: 25 },
    ]);

    // Start server-authoritative answer capture session (same as your current DD flow)
    const ANSWER_SECONDS =
        typeof game.timeToAnswer === "number" && game.timeToAnswer > 0
            ? game.timeToAnswer
            : 9;

    const RECORD_MS = ANSWER_SECONDS * 1000;
    const deadlineAt = Date.now() + RECORD_MS;

    game.phase = "ANSWER_CAPTURE";
    game.answeringPlayerKey = playerName || dd.playerName;
    game.answerClueKey = clueKey;
    game.answerSessionId = `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
    game.answerTranscript = null;
    game.answerVerdict = null;
    game.answerConfidence = null;

    ctx.clearAnswerWindow(game);

    ctx.broadcast(gameId, {
        type: "answer-capture-start",
        gameId,
        playerName: game.answeringPlayerKey,
        answerSessionId: game.answerSessionId,
        clueKey,
        durationMs: RECORD_MS,
        deadlineAt,
    });

    if (ANSWER_SECONDS > 0) {
        ctx.startGameTimer(gameId, game, ctx, ANSWER_SECONDS, "answer");
    }

    ctx.startAnswerWindow(gameId, game, ctx.broadcast, RECORD_MS, () => {
        const g = ctx.games?.[gameId];
        if (!g) return;

        if (!g.answerSessionId) return;
        if (g.answerSessionId !== game.answerSessionId) return;
        if (g.answeringPlayerKey !== game.answeringPlayerKey) return;
        if (!g.selectedClue) return;

        g.phase = "RESULT";
        g.answerTranscript = "";
        g.answerVerdict = "incorrect";
        g.answerConfidence = 0.0;

        const ddWorth =
            g.dailyDouble?.clueKey === g.clueState?.clueKey &&
            Number.isFinite(Number(g.dailyDouble?.wager))
                ? Number(g.dailyDouble.wager)
                : null;

        const clueValue = ctx.parseClueValue(g.selectedClue?.value);
        const worth = ddWorth !== null ? ddWorth : clueValue;

        ctx.broadcast(gameId, {
            type: "answer-result",
            gameId,
            answerSessionId: g.answerSessionId,
            playerName: game.answeringPlayerKey,
            transcript: "",
            verdict: "incorrect",
            confidence: 0.0,
            suggestedDelta: -worth,
        });

        ctx.autoResolveAfterJudgement(ctx, gameId, g, game.answeringPlayerKey, "incorrect")
            .catch((e) => console.error("[dd-answer-timeout] autoResolve failed:", e));
    });
}

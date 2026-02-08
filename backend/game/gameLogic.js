function applyScore(game, playerName, delta) {
    if (!game.scores) game.scores = {};
    game.scores[playerName] = (game.scores[playerName] || 0) + Number(delta || 0);
}

function lockBoardSelection(ctx, gameId, game) {
    if (!game) return 0;

    game.boardSelectionLocked = true;

    // version token so old scheduled unlocks can’t unlock a newer lock
    game.boardSelectionLockVersion = (game.boardSelectionLockVersion || 0) + 1;

    ctx.broadcast(gameId, {
        type: "board-selection-locked",
        lockVersion: game.boardSelectionLockVersion,
    });

    return game.boardSelectionLockVersion;
}

function unlockBoardSelection(ctx, gameId, game, lockVersion) {
    if (!game) return;

    // Only unlock if this scheduled unlock is still current
    if (typeof lockVersion === "number" && lockVersion > 0) {
        if ((game.boardSelectionLockVersion || 0) !== lockVersion) return;
    }

    if (!game.boardSelectionLocked) return;

    game.boardSelectionLocked = false;
    game.boardSelectionLockReason = null;

    ctx.broadcast(gameId, {
        type: "board-selection-unlocked",
        lockVersion: game.boardSelectionLockVersion || 0,
    });
}

function returnToBoard(game, gameId, ctx){
    // Reset clue state
    game.selectedClue = null;
    game.buzzed = null;
    game.buzzerLocked = true;
    game.phase = "board";
    game.clueState = null;


    const selectorName = String(game.selectorName || "").trim();

    let lockVersion = 0;

    lockVersion = lockBoardSelection(ctx, gameId, game);

    ctx.broadcast(gameId, {
        type: "phase-changed",
        phase: "board",
        selectorKey: game.selectorKey ?? null,
        selectorName: game.selectorName ?? null,
    });

    ctx.broadcast(gameId, { type: "returned-to-board", selectedClue: null, boardSelectionLocked: game.boardSelectionLocked });

    (async () => {
        const pad = 100;

        await ctx.aiHostVoiceSequence(ctx, gameId, game, [
            {slot: selectorName, pad},
            {slot: "your_up", pad, after: () => unlockBoardSelection(ctx, gameId, game, lockVersion) },
        ]);
    })();
}

function finishClueAndReturnToBoard(ctx, gameId, game) {
    if (!game) return;

    // Mark cleared if we have a clue
    if (game.selectedClue) {
        if (!game.clearedClues) game.clearedClues = new Set();
        const clueId = `${game.selectedClue.value}-${game.selectedClue.question}`;
        game.clearedClues.add(clueId);

        ctx.broadcast(gameId, { type: "clue-cleared", clueId });

        ctx.checkBoardTransition(game, gameId, ctx);
    }


    returnToBoard(game, gameId, ctx);
}

export function parseClueValue(val) {
    const n = Number(String(val || "").replace(/[^0-9]/g, ""));
    return Number.isFinite(n) ? n : 0;
}

export async function autoResolveAfterJudgement(ctx, gameId, game, playerName, verdict) {
    if (!game || !game.selectedClue) return;

    const clueValue = parseClueValue(game.selectedClue?.value);
    const delta = verdict === "correct" ? clueValue : verdict === "incorrect" ? -clueValue : 0;

    // Apply score immediately (authoritative)
    if (verdict === "correct" || verdict === "incorrect") {
        applyScore(game, playerName, delta);
        ctx.broadcast(gameId, { type: "update-scores", scores: game.scores });
    }

    if (verdict === "correct") {
        game.selectedClue.isAnswerRevealed = true;


        await ctx.aiHostVoiceSequence(ctx, gameId, game, [
            {slot: "correct", pad: 200, after: () => ctx.broadcast(gameId, { type: "answer-revealed", clue: game.selectedClue })},

        ]);

        // Correct player becomes selector
        const p = (game.players || []).find(x => x?.name === playerName);
        game.selectorKey = ctx.playerStableId(p || { name: playerName });
        game.selectorName = playerName;

        await ctx.sleep(3000);

        finishClueAndReturnToBoard(ctx, gameId, game)

        return;
    }

    // verdict === "incorrect"

    // Lock them out from re-buzzing on this clue
    const p = (game.players || []).find(x => x?.name === playerName);
    const stable = ctx.playerStableId(p || { name: playerName });
    if (game.clueState?.lockedOut) game.clueState.lockedOut[stable] = true;

    // Clear any answer state so clue can continue
    game.buzzed = null;
    game.answeringPlayerKey = null;
    game.answerSessionId = null;
    game.answerClueKey = null;
    game.answerTranscript = game.answerTranscript ?? "";
    game.answerVerdict = "incorrect";

    // Cancel timers tied to the answering window / old buzz window
    ctx.clearAnswerWindow(game);
    ctx.clearGameTimer(game);

    // Check if anyone remains eligible to buzz
    const players = game.players || [];
    const anyoneLeft = players.some(pp => !game.clueState?.lockedOut?.[ctx.playerStableId(pp)]);

    if (!anyoneLeft) {
        // Everyone buzzed and missed. Do NOT play the "nobody" line and do NOT reopen buzzers.
        // Keep things locked, optionally play the normal incorrect line, then reveal and return.
        game.buzzerLocked = true;
        ctx.broadcast(gameId, { type: "buzzer-locked" });


        await ctx.aiHostVoiceSequence(ctx, gameId, game, [
            {slot: "incorrect", pad: 200, after: () => {
                    game.selectedClue.isAnswerRevealed = true;
                    ctx.broadcast(gameId, { type: "answer-revealed", clue: game.selectedClue });
                }
            },

        ]);

        await ctx.sleep(3000);

        finishClueAndReturnToBoard(ctx, gameId, game)

        return;
    }

    // Prompt and then reopen buzzers for remaining eligible players
    game.buzzerLocked = true;
    ctx.broadcast(gameId, { type: "buzzer-locked" });


    await ctx.aiHostVoiceSequence(ctx, gameId, game, [
        {slot: "incorrect", pad: 1000},
        {slot: "rebuzz", pad: 700, after: () => {
                ctx.broadcast(gameId, { type: "buzzer-ui-reset" });
                ctx.doUnlockBuzzerAuthoritative(gameId, game, ctx);
            }
        },
    ]);
}

export function cancelAutoUnlock(game) {
    if (game?.autoUnlockTimer) {
        clearTimeout(game.autoUnlockTimer);
        game.autoUnlockTimer = null;
    }
    game.autoUnlockClueKey = null;
}

export function doUnlockBuzzerAuthoritative( gameId, game, ctx) {
    if (!game) return;

    // Always restart the buzz timer window when we "unlock"
    // (prevents stale timers from instantly expiring after a rebuzz)
    ctx.clearGameTimer(game);


    if (!game.clueState) game.clueState = {};
    game.clueState.buzzOpenAtMs = Date.now();

    game.buzzerLocked = false;
    ctx.broadcast(gameId, { type: "buzzer-unlocked" });

    // Reset pending buzz window whenever you unlock
    if (game.pendingBuzz?.timer) clearTimeout(game.pendingBuzz.timer);
    game.pendingBuzz = null;
    game.buzzed = null;


    if (game.timeToBuzz === -1) return;

    ctx.startGameTimer(
        gameId,
        game,
        ctx,
        game.timeToBuzz,
        "buzz",
        ({ gameId, game }) => {
            if (!game) return;
            if (!game.selectedClue) return;

            // If still open and nobody buzzed => AI host resolves it
            if (game.buzzerLocked || game.buzzed) return;

            game.buzzerLocked = true;
            ctx.broadcast(gameId, { type: "buzzer-locked" });

            (async () => {
                await ctx.aiHostVoiceSequence(ctx, gameId, game, [
                    {slot: "nobody", pad: 200, after: () => {
                            game.selectedClue.isAnswerRevealed = true;
                            ctx.broadcast(gameId, { type: "answer-revealed", clue: game.selectedClue });
                        }},
                ]);

                await ctx.sleep(3000);

                if (!game.clearedClues) game.clearedClues = new Set();
                const clueId = `${game.selectedClue.value}-${game.selectedClue.question}`;
                game.clearedClues.add(clueId);
                ctx.broadcast(gameId, { type: "clue-cleared", clueId });
                ctx.checkBoardTransition(game, gameId, ctx)

                returnToBoard(game, gameId, ctx);

            })();
        }
    );
}

export async function scheduleAutoUnlockForClue({ gameId, game, clueKey, ttsAssetId, ctx }) {
    if (!game) return;

    cancelAutoUnlock(game);

    // if no asset id, just unlock immediately (never deadlock)
    if (!ttsAssetId) {
        doUnlockBuzzerAuthoritative( gameId, game, ctx);
        return;
    }

    const durationMs = await ctx.getTtsDurationMs(ttsAssetId);

    // If we couldn't compute duration, unlock immediately (still safe)
    const waitMs = Math.max(0, (durationMs ?? 0) + 150); // +buffer for decode/play
    game.autoUnlockClueKey = clueKey;

    game.autoUnlockTimer = setTimeout(() => {
        const game = ctx.games?.[gameId];
        if (!game) return;

        // Only unlock if we're still on the same clue
        if (game.autoUnlockClueKey !== clueKey) return;

        game.autoUnlockTimer = null;
        doUnlockBuzzerAuthoritative( gameId, game, ctx );
    }, waitMs);
}

export function findCategoryForClue(game, clue) {
    const boardKey = game.activeBoard || "firstBoard";
    const cats = game.boardData?.[boardKey]?.categories;
    if (!Array.isArray(cats)) return null;

    const v = clue?.value;
    const q = String(clue?.question ?? "").trim();
    if (!q) return null;

    for (const cat of cats) {
        const catName = String(cat?.category ?? "").trim();
        const values = Array.isArray(cat?.values) ? cat.values : [];
        for (const c of values) {
            const sameValue = c?.value === v;
            const sameQuestion = String(c?.question ?? "").trim() === q;
            if (sameValue && sameQuestion) return catName || null;
        }
    }

    return null;
}
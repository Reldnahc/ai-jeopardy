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

    // Reset clue state
    game.selectedClue = null;
    game.buzzed = null;
    game.buzzerLocked = true;
    game.phase = "board";
    game.clueState = null;

    // IMPORTANT: lock selection immediately when we return to board
    // (we will unlock after host finishes speaking)
    const narrationEnabled = Boolean(game?.lobbySettings?.narrationEnabled);
    const selectorName = String(game.selectorName || "").trim();

    let lockVersion = 0;
    if (narrationEnabled && selectorName) {
        lockVersion = lockBoardSelection(ctx, gameId, game);
    } else {
        // If no narration, ensure unlocked
        game.boardSelectionLocked = false;
        game.boardSelectionLockReason = null;
    }

    ctx.broadcast(gameId, {
        type: "phase-changed",
        phase: "board",
        selectorKey: game.selectorKey ?? null,
        selectorName: game.selectorName ?? null,
    });

    ctx.broadcast(gameId, { type: "returned-to-board", selectedClue: null, boardSelectionLocked: game.boardSelectionLocked });

    // Speak “Name…” then “you’re up”, then unlock selection authoritatively
    if (narrationEnabled && selectorName) {
        (async () => {
            const g0 = ctx.games?.[gameId];
            if (!g0) return;

            // If something else re-locked the board since we started, don’t proceed
            if ((g0.boardSelectionLockVersion || 0) !== lockVersion) return;

            const a = await ctx.aiHostSayPlayerName(gameId, g0, selectorName, ctx);
            const aMs = a?.ms ?? 0;

            // schedule “your_up” after name finishes
            ctx.aiAfter(gameId, (aMs || 650) + 150, async () => {
                const g1 = ctx.games?.[gameId];
                if (!g1) return;

                if ((g1.boardSelectionLockVersion || 0) !== lockVersion) return;

                const b = await ctx.aiHostSayRandomFromSlot(gameId, g1, "your_up", ctx);
                const bMs = b?.ms ?? 0;

                // unlock shortly after “your_up” finishes
                ctx.aiAfter(gameId, (bMs || 650) + 150, () => {
                    const g2 = ctx.games?.[gameId];
                    if (!g2) return;
                    unlockBoardSelection(ctx, gameId, g2, lockVersion);
                });
            });
        })();
    } else {
        // no narration => unlock immediately (or just leave it unlocked)
        const g = ctx.games?.[gameId];
        if (g) unlockBoardSelection(ctx, gameId, g, 0);
    }
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

        const said = await ctx.aiHostSayRandomFromSlot(gameId, game, "correct", ctx);
        const ms = said?.ms ?? 0;

        ctx.broadcast(gameId, { type: "answer-revealed", clue: game.selectedClue });

        // Correct player becomes selector
        const p = (game.players || []).find(x => x?.name === playerName);
        game.selectorKey = ctx.playerStableId(p || { name: playerName });
        game.selectorName = playerName;

        ctx.aiAfter(gameId, ms + 3500, () => {
            const g = ctx.games?.[gameId];
            if (!g) return;
            finishClueAndReturnToBoard(ctx, gameId, g);
        });

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

        let ms = 0;
        try {
            const said = await ctx.aiHostSayRandomFromSlot(gameId, game, "incorrect", ctx);
            ms = said?.ms ?? 0;
        } catch (e) {
            console.error("[autoResolveAfterJudgement] aiHostSayRandomFromSlot failed:", e);
        }

        game.selectedClue.isAnswerRevealed = true;
        ctx.broadcast(gameId, { type: "answer-revealed", clue: game.selectedClue });

        ctx.aiAfter(gameId, ms + 3500, () => {
            const g = ctx.games?.[gameId];
            if (!g) return;
            finishClueAndReturnToBoard(ctx, gameId, g);
        });

        return;
    }

    // Prompt and then reopen buzzers for remaining eligible players
    game.buzzerLocked = true;
    ctx.broadcast(gameId, { type: "buzzer-locked" });

    let msIncorrect = 0;
    try {
        const said = await ctx.aiHostSayRandomFromSlot(gameId, game, "incorrect", ctx);
        msIncorrect = said?.ms ?? 0;
    } catch (e) {
        console.error("[autoResolveAfterJudgement] aiHostSayRandomFromSlot incorrect failed:", e);
    }

// After "incorrect", play "rebuzz" (ONLY when someone is still eligible)
    let msRebuzz = 0;
    ctx.aiAfter(gameId, msIncorrect + 1000, async () => {
        const g = ctx.games?.[gameId];
        if (!g) return;

        try {
            const said2 = await ctx.aiHostSayRandomFromSlot(gameId, g, "rebuzz", ctx);
            msRebuzz = said2?.ms ?? 0;
        } catch (e) {
            console.error("[autoResolveAfterJudgement] aiHostSayRandomFromSlot rebuzz failed:", e);
        }

        // Unlock after both lines finish
        ctx.aiAfter(gameId, msRebuzz + 700, () => {
            const game = ctx.games?.[gameId];
            if (!game) return;
            ctx.doUnlockBuzzerAuthoritative(gameId, game, ctx);
            ctx.broadcast(gameId, { type: "buzzer-ui-reset" });
        });
    });
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

    game.buzzerLocked = false;
    ctx.broadcast(gameId, { type: "buzzer-unlocked" });

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
                const said = await ctx.aiHostSayRandomFromSlot(gameId, game, "nobody", ctx);
                const ms = said?.ms ?? 0;
                // Reveal once
                game.selectedClue.isAnswerRevealed = true;
                ctx.broadcast(gameId, { type: "answer-revealed", clue: game.selectedClue });

                // After the line finishes, return to board + clear clue
                ctx.aiAfter(gameId, ms + 3500, () => {
                    const g = ctx.games?.[gameId];
                    if (!g) return;
                    if (!g.selectedClue) return;

                    if (!g.clearedClues) g.clearedClues = new Set();
                    const clueId = `${g.selectedClue.value}-${g.selectedClue.question}`;
                    g.clearedClues.add(clueId);
                    ctx.broadcast(gameId, { type: "clue-cleared", clueId });

                    ctx.checkBoardTransition(game, gameId, ctx)

                    g.selectedClue = null;
                    g.buzzed = null;
                    g.phase = "board";
                    g.buzzerLocked = true;

                    ctx.broadcast(gameId, {
                        type: "phase-changed",
                        phase: "board",
                        selectorKey: g.selectorKey ?? null,
                        selectorName: g.selectorName ?? null,
                    });

                    ctx.broadcast(gameId, { type: "returned-to-board", selectedClue: null, boardSelectionLocked: g.boardSelectionLocked });
                });
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
        const g = ctx.games?.[gameId];
        if (!g) return;

        // Only unlock if we're still on the same clue
        if (g.autoUnlockClueKey !== clueKey) return;

        g.autoUnlockTimer = null;
        doUnlockBuzzerAuthoritative( gameId, g, ctx );
    }, waitMs);
}
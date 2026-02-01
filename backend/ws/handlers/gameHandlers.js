function parseClueValue(val) {
    const n = Number(String(val || "").replace(/[^0-9]/g, ""));
    return Number.isFinite(n) ? n : 0;
}

function applyScore(game, playerName, delta) {
    if (!game.scores) game.scores = {};
    game.scores[playerName] = (game.scores[playerName] || 0) + Number(delta || 0);
}

function finishClueAndReturnToBoard(ctx, gameId, game, { keepSelector }) {
    if (!game) return;

    // Mark cleared if we have a clue
    if (game.selectedClue) {
        if (!game.clearedClues) game.clearedClues = new Set();
        const clueId = `${game.selectedClue.value}-${game.selectedClue.question}`;
        game.clearedClues.add(clueId);
        ctx.broadcast(gameId, { type: "clue-cleared", clueId });
    }

    // Reset clue state
    game.selectedClue = null;
    game.buzzed = null;
    game.buzzerLocked = true;
    game.phase = "board";
    game.clueState = null;

    // Selector remains if keepSelector=true (no-buzz or nobody-eligible)
    ctx.broadcast(gameId, {
        type: "phase-changed",
        phase: "board",
        selectorKey: game.selectorKey ?? null,
        selectorName: game.selectorName ?? null,
    });

    ctx.broadcast(gameId, { type: "returned-to-board", selectedClue: null });
}
async function autoResolveAfterJudgement(ctx, gameId, game, playerName, verdict) {
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

        const said = await ctx.aiHostSayRandomFromSlot(gameId, game, "correct");
        const ms = said?.ms ?? 0;

        ctx.broadcast(gameId, { type: "answer-revealed", clue: game.selectedClue });

        // Correct player becomes selector
        const p = (game.players || []).find(x => x?.name === playerName);
        game.selectorKey = ctx.playerStableId(p || { name: playerName });
        game.selectorName = playerName;

        ctx.aiAfter(gameId, ms + 3500, () => {
            const g = ctx.games?.[gameId];
            if (!g) return;
            finishClueAndReturnToBoard(ctx, gameId, g, { keepSelector: false });
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
            const said = await ctx.aiHostSayRandomFromSlot(gameId, game, "incorrect");
            ms = said?.ms ?? 0;
        } catch (e) {
            console.error("[autoResolveAfterJudgement] aiHostSayRandomFromSlot failed:", e);
        }

        game.selectedClue.isAnswerRevealed = true;
        ctx.broadcast(gameId, { type: "answer-revealed", clue: game.selectedClue });

        ctx.aiAfter(gameId, ms + 3500, () => {
            const g = ctx.games?.[gameId];
            if (!g) return;
            finishClueAndReturnToBoard(ctx, gameId, g, { keepSelector: true });
        });

        return;
    }

    // Prompt and then reopen buzzers for remaining eligible players
    game.buzzerLocked = true;
    ctx.broadcast(gameId, { type: "buzzer-locked" });

    let msIncorrect = 0;
    try {
        const said = await ctx.aiHostSayRandomFromSlot(gameId, game, "incorrect");
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
            const said2 = await ctx.aiHostSayRandomFromSlot(gameId, g, "rebuzz");
            msRebuzz = said2?.ms ?? 0;
        } catch (e) {
            console.error("[autoResolveAfterJudgement] aiHostSayRandomFromSlot rebuzz failed:", e);
        }

        // Unlock after both lines finish
        ctx.aiAfter(gameId, msRebuzz + 700, () => {
            const gg = ctx.games?.[gameId];
            if (!gg) return;
            ctx.doUnlockBuzzerAuthoritative({ gameId, game: gg });
            ctx.broadcast(gameId, { type: "buzzer-ui-reset" });
        });
    });


}


export const gameHandlers = {
    "join-game": async ({ ws, data, ctx }) => {
        const { gameId, playerName } = data;

        if (!playerName || !playerName.trim()) {
            ws.send(JSON.stringify({ type: 'error', message: 'Player name cannot be blank.' }));
            return;
        }

        if (!ctx.games[gameId]) {
            ws.send(JSON.stringify({ type: 'error', message: 'Game does not exist!' }));
            return;
        }

        // 1. Find player by NAME (The Source of Truth)
        const existingPlayer = ctx.games[gameId].players.find((p) => p.name === playerName);

        if (existingPlayer) {
            // RECONNECT LOGIC
            console.log(`[Server] Player ${playerName} reconnected to Game ${gameId}`);

            // Update their socket ID so server sends messages to the right place
            existingPlayer.id = ws.id;
            existingPlayer.online = true;
            ws.gameId = gameId;

            // Force this socket to know it belongs to this game
            // (This prevents the 'kick-player' host check from failing later)

        } else {
            // NEW PLAYER LOGIC
            // Only add if they truly aren't in the list
            const colorData = await ctx.getColorFromPlayerName(playerName);
            const raceConditionCheck = ctx.games[gameId].players.find((p) => p.name === playerName);

            if (raceConditionCheck) {
                raceConditionCheck.id = ws.id;
                raceConditionCheck.online = true;
                ws.gameId = gameId;
            } else {
                const newPlayer = {
                    id: ws.id,
                    name: playerName,
                    color: colorData?.color || "bg-blue-500",
                    text_color: colorData?.text_color || "text-white",
                    online: true
                };
                ctx.games[gameId].players.push(newPlayer);
                ws.gameId = gameId;
            }
        }

        const game = ctx.games[gameId];
        const me = game.players.find(p => p.id === ws.id) || game.players.find(p => p.name === playerName);
        const myName = me?.name;
        const myLockoutUntil = myName ? (game.buzzLockouts?.[myName] || 0) : 0;

        // 2. Hydrate Client State
        // Send EVERYTHING needed to sync the client to right now
        ws.send(JSON.stringify({
            type: "game-state",
            gameId,
            players: ctx.games[gameId].players.map(p => ({
                name: p.name,
                color: p.color,
                text_color: p.text_color
            })),
            host: ctx.games[gameId].host,
            buzzResult: ctx.games[gameId].buzzed,
            playerBuzzLockoutUntil: myLockoutUntil,
            clearedClues: Array.from(ctx.games[gameId].clearedClues || new Set()),
            boardData: ctx.games[gameId].boardData,
            selectedClue: ctx.games[gameId].selectedClue || null,
            buzzerLocked: ctx.games[gameId].buzzerLocked,
            scores: ctx.games[gameId].scores,
            // Sync timers
            timerEndTime: ctx.games[gameId].timerEndTime,
            timerDuration: ctx.games[gameId].timerDuration,
            timerVersion: ctx.games[gameId].timerVersion || 0,
            activeBoard: ctx.games[gameId].activeBoard || "firstBoard",
            isFinalJeopardy: Boolean(ctx.games[gameId].isFinalJeopardy),
            finalJeopardyStage: ctx.games[gameId].finalJeopardyStage || null,
            wagers: ctx.games[gameId].wagers || {},
            lobbySettings: ctx.games[gameId].lobbySettings || null,
            phase: game.phase || null,
            selectorKey: game.selectorKey || null,
            selectorName: game.selectorName || null,
            welcomeTtsAssetId: game.welcomeTtsAssetId || null,
            welcomeEndsAt: typeof game.welcomeEndsAt === "number" ? game.welcomeEndsAt : null,
            answeringPlayer: game.answeringPlayerKey || null,
            answerSessionId: game.answerSessionId || null,
            answerDeadlineAt: game.answerDeadlineAt || null,
            answerClueKey: game.answerClueKey || null,
        }));

        // Notify others
        ctx.broadcast(gameId, {
            type: "player-list-update",
            players: ctx.games[gameId].players.map(p => ({
                name: p.name,
                color: p.color,
                text_color: p.text_color
            })),
            host: ctx.games[gameId].host,
        });
    },

    "leave-game": async ({ ws, data, ctx }) => {
        const { gameId, playerName } = data;
        if (!gameId || !ctx.games[gameId]) return;

        const game = ctx.games[gameId];

        // Prefer explicit name (intentional leave), fallback to socket id
        const name = String(playerName || "").trim();

        const leavingPlayer =
            (name && game.players.find(p => p.name === name)) ||
            game.players.find(p => p.id === ws.id);

        if (!leavingPlayer) return;

        const leavingName = leavingPlayer.name;

        // HARD REMOVE from players
        game.players = game.players.filter(p => p.name !== leavingName);

        // PURGE any state that can block FJ
        if (game.wagers) delete game.wagers[leavingName];
        if (game.drawings) delete game.drawings[leavingName];
        if (game.scores) delete game.scores[leavingName];

        // If host left, reassign (or delete if empty)
        if (game.host === leavingName) {
            if (game.players.length === 0) {
                delete ctx.games[gameId];
                return;
            }
            game.host = game.players[0].name;
        }

        // Stop this socket from continuing to receive broadcasts for this game
        ws.gameId = null;

        ctx.broadcast(gameId, {
            type: "player-list-update",
            players: game.players.map(p => ({
                name: p.name,
                color: p.color,
                text_color: p.text_color,
                online: p.online !== false,
            })),
            host: game.host,
        });
        // After removal, re-check whether we can unblock Final Jeopardy
        const evt1 = ctx.checkAllWagersSubmitted(game);
        if (evt1) ctx.broadcast(gameId, evt1);

        const evt2 = ctx.checkAllFinalDrawingsSubmitted(game);
        if (evt2) ctx.broadcast(gameId, evt2);
    },

    "buzz": async ({ ws, data, ctx }) => {
        const { gameId } = data;
        const game = ctx.games[gameId];
        if (!game) return;

        const player = game.players.find((p) => p.id === ws.id);
        if (!player?.name) return;

        const stable = ctx.playerStableId(player);
        const lockedOut = game.clueState?.lockedOut || {};
        if (game.clueState?.clueKey && lockedOut[stable]) {
            ws.send(JSON.stringify({
                type: "buzz-denied",
                reason: "already-attempted",
                lockoutUntil: 0,
            }));
            return;
        }

        if (!game.buzzLockouts) game.buzzLockouts = {};

        const now = Date.now();
        const lockoutUntil = game.buzzLockouts[player.name] || 0;

        // Already buzzed by someone else
        if (game.buzzed) {
            ws.send(JSON.stringify({
                type: "buzz-denied",
                reason: "already-buzzed",
                lockoutUntil: lockoutUntil,
            }));
            return;
        }

        // Player is currently locked out (from early buzzing)
        if (lockoutUntil > now) {
            ws.send(JSON.stringify({
                type: "buzz-denied",
                reason: "locked-out",
                lockoutUntil,
            }));
            return;
        }

        // Buzzer is locked => early buzz => apply lockout
        if (game.buzzerLocked) {
            const EARLY_BUZZ_LOCKOUT_MS = 1000; // match your current behavior (was 1s)
            const until = now + EARLY_BUZZ_LOCKOUT_MS;
            game.buzzLockouts[player.name] = until;

            ws.send(JSON.stringify({
                type: "buzz-denied",
                reason: "early",
                lockoutUntil: until,
            }));
            return;
        }

        // Accept buzz
        game.buzzed = player.name;
        ctx.broadcast(gameId, { type: "buzz-result", playerName: player.name });

// Lock buzzer immediately (prevents weird edge cases)
        game.buzzerLocked = true;
        ctx.broadcast(gameId, { type: "buzzer-locked" });

// Say the player's name (Jeopardy-style), then start answer capture
        let nameMs = 0;
        try {
            const said = await ctx.aiHostSayPlayerName(gameId, game, player.name);
            nameMs = said?.ms ?? 0;
        } catch (e) {
            console.error("[buzz] aiHostSayPlayerName failed:", e);
        }

    // Delay answer capture until name finishes (+ buffer)
        const startCaptureAfterMs = Math.max(0, nameMs + 150);

        setTimeout(() => {
            const g = ctx.games?.[gameId];
            if (!g) return;

            const ANSWER_SECONDS =
                typeof g.timeToAnswer === "number" && g.timeToAnswer > 0
                    ? g.timeToAnswer
                    : 9;

            const RECORD_MS = ANSWER_SECONDS * 1000;

            // Ensure we're still on same buzz & clue
            if (g.buzzed !== player.name) return;

            // Start server-authoritative answer capture session
            const boardKey = g.activeBoard || "firstBoard";
            const v = String(g.selectedClue?.value ?? "");
            const q = String(g.selectedClue?.question ?? "").trim();
            const clueKey = `${boardKey}:${v}:${q}`;

            g.phase = "ANSWER_CAPTURE";
            g.answeringPlayerKey = player.name;
            g.answerClueKey = clueKey;
            g.answerSessionId = `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
            g.answerTranscript = null;
            g.answerVerdict = null;
            g.answerConfidence = null;

            ctx.clearAnswerWindow(g);

            const deadlineAt = Date.now() + RECORD_MS;

            ctx.broadcast(gameId, {
                type: "answer-capture-start",
                gameId,
                playerName: player.name,
                answerSessionId: g.answerSessionId,
                clueKey,
                durationMs: RECORD_MS,
                deadlineAt,
            });
            // Start "answer" timer (also clears the prior "buzz" timer)
            if (ANSWER_SECONDS > 0) {
                ctx.startGameTimer(gameId, g, ctx.broadcast, ANSWER_SECONDS, "answer");
            }


            ctx.startAnswerWindow(gameId, g, ctx.broadcast, RECORD_MS, () => {
                const gg = ctx.games?.[gameId];
                if (!gg) return;

                // Only expire the CURRENT answer session (prevents stale timeouts)
                if (!gg.answerSessionId) return;
                if (gg.answerSessionId !== g.answerSessionId) return;
                if (gg.answeringPlayerKey !== player.name) return;
                if (!gg.selectedClue) return;

                // Force resolve as incorrect (no-answer)
                gg.phase = "RESULT";
                gg.answerTranscript = "";
                gg.answerVerdict = "incorrect";
                gg.answerConfidence = 0.0;

                const clueValue = parseClueValue(gg.selectedClue?.value);

                ctx.broadcast(gameId, {
                    type: "answer-result",
                    gameId,
                    answerSessionId: gg.answerSessionId,
                    playerName: player.name,
                    transcript: "",
                    verdict: "incorrect",
                    confidence: 0.0,
                    suggestedDelta: -clueValue,
                });

                autoResolveAfterJudgement(ctx, gameId, gg, player.name, "incorrect")
                    .catch((e) => console.error("[answer-timeout] autoResolve failed:", e));
            });

        }, startCaptureAfterMs);

        //TODO REIMPLEMENT UI TIMER
        // if (game.timeToAnswer !== -1) {
        //     ctx.startGameTimer(gameId, game, ctx.broadcast, game.timeToAnswer, "answer");
        // }
    },

    "unlock-buzzer": async ({ ws, data, ctx }) => {
        const { gameId } = data;
        const game = ctx.games[gameId];
        if (!game) return;
        if (!ctx.requireHost(game, ws)) return;

        ctx.cancelAutoUnlock(game);

        ctx.doUnlockBuzzerAuthoritative({ gameId, game });
    },

    "lock-buzzer": async ({ ws, data, ctx }) => {
        const {gameId} = data;
        if (!ctx.requireHost(ctx.games[gameId], ws)) return;

        if (ctx.games[gameId]) {
            ctx.games[gameId].buzzerLocked = true; // Lock the buzzer
            ctx.broadcast(gameId, {type: 'buzzer-locked'}); // Notify all players
        }
    },

    "answer-audio-blob": async ({ ws, data, ctx }) => {
        const { gameId, answerSessionId, mimeType, dataBase64 } = data || {};
        const game = ctx.games?.[gameId];
        if (!game) return;

        //Must be in capture phase
        if (game.phase !== "ANSWER_CAPTURE") {
            ws.send(JSON.stringify({
                type: "answer-error",
                gameId,
                answerSessionId,
                message: `Not accepting answers right now (phase=${String(game.phase)}, buzzed=${String(game.buzzed)}, selectedClue=${Boolean(game.selectedClue)})`
            }));
            return;
        }


        // Session must match (stale protection)
        if (!answerSessionId || answerSessionId !== game.answerSessionId) {
            ws.send(JSON.stringify({ type: "answer-error", gameId, answerSessionId, message: "Stale or invalid answer session." }));
            return;
        }

        // Only the selected answering player may submit audio
        const player = game.players?.find((p) => p.id === ws.id);
        if (!player?.name || player.name !== game.answeringPlayerKey) {
            ws.send(JSON.stringify({ type: "answer-error", gameId, answerSessionId, message: "You are not the answering player." }));
            return;
        }

        // Basic payload validation / size limits
        if (typeof dataBase64 !== "string" || !dataBase64.trim()) {
            ws.send(JSON.stringify({ type: "answer-error", gameId, answerSessionId, message: "Missing audio data." }));
            return;
        }

        // Decode base64
        let buf;
        try {
            buf = Buffer.from(dataBase64, "base64");
        } catch {
            ws.send(JSON.stringify({ type: "answer-error", gameId, answerSessionId, message: "Invalid base64 audio." }));
            return;
        }

        // Hard cap: keep small to avoid WS abuse (tune later)
        const MAX_BYTES = 2_000_000; // 2MB
        if (buf.length > MAX_BYTES) {
            ws.send(JSON.stringify({ type: "answer-error", gameId, answerSessionId, message: "Audio too large." }));
            return;
        }

        // Stop the answer window (prevents timeout firing)
        ctx.clearAnswerWindow(game);

        ctx.broadcast(gameId, { type: "answer-capture-ended", gameId, answerSessionId });

        // Move to judging phase
        game.phase = "JUDGING";

        // --- STT ---
        let transcript = "";
        try {
            const stt = await ctx.transcribeAnswerAudio({ buffer: buf, mimeType });
            transcript = String(stt?.text || "").trim();
            if (!transcript) {
                const parseValue = (val) => {
                    const n = Number(String(val || "").replace(/[^0-9]/g, ""));
                    return Number.isFinite(n) ? n : 0;
                };
                const clueValue = parseValue(game.selectedClue?.value);

                game.phase = "RESULT";
                game.answerTranscript = "";
                game.answerVerdict = "incorrect";
                game.answerConfidence = 0.0;

                ctx.broadcast(gameId, {
                    type: "answer-result",
                    gameId,
                    answerSessionId,
                    playerName: player.name,
                    transcript: "",
                    verdict: "incorrect",
                    confidence: 0.0,
                    suggestedDelta: -clueValue,
                });
                return autoResolveAfterJudgement(ctx, gameId, game, player.name, "incorrect")
                    .catch((e) => console.error("[answer-audio-blob] autoResolve failed:", e));
            }
        } catch (e) {
            console.error("[answer-audio-blob] STT failed:", e?.message || e);
            const parseValue = (val) => {
                const n = Number(String(val || "").replace(/[^0-9]/g, ""));
                return Number.isFinite(n) ? n : 0;
            };
            const clueValue = parseValue(game.selectedClue?.value);

            game.phase = "RESULT";
            game.answerTranscript = "";
            game.answerVerdict = "incorrect";
            game.answerConfidence = 0.0;

            ctx.broadcast(gameId, {
                type: "answer-result",
                gameId,
                answerSessionId,
                playerName: player.name,
                transcript: "",
                verdict: "incorrect",
                confidence: 0.0,
                suggestedDelta: -clueValue,
            });
            return autoResolveAfterJudgement(ctx, gameId, game, player.name, "incorrect")
                .catch((err) => console.error("[answer-audio-blob-error] autoResolve failed:", err));

        }

        ctx.broadcast(gameId, {
            type: "answer-transcript",
            gameId,
            answerSessionId,
            playerName: player.name,
            transcript,
            isFinal: true,
        });

        // --- JUDGE ---
        let verdict = "incorrect";
        let confidence = 0.0;

        try {
            const expectedAnswer = String(game.selectedClue?.answer || "");
            const clueQuestion = String(game.selectedClue?.question || "");
            const judged = await ctx.judgeClueAnswerFast({ clueQuestion, expectedAnswer, transcript });

            verdict = judged?.verdict || "needs_host";
            confidence = Number(judged?.confidence || 0);
        } catch (e) {
            console.error("[answer-audio-blob] judge failed:", e?.message || e);
            verdict = "needs_host";
            confidence = 0.0;
        }

        // Suggest delta but do NOT mutate scores yet (keeps this ripple-free)
        const parseValue = (val) => {
            const n = Number(String(val || "").replace(/[^0-9]/g, ""));
            return Number.isFinite(n) ? n : 0;
        };
        const clueValue = parseValue(game.selectedClue?.value);
        const suggestedDelta =
            verdict === "correct" ? clueValue :
                verdict === "incorrect" ? -clueValue :
                    0;

        game.phase = "RESULT";
        game.answerTranscript = transcript;
        game.answerVerdict = verdict;
        game.answerConfidence = confidence;

        ctx.broadcast(gameId, {
            type: "answer-result",
            gameId,
            answerSessionId,
            playerName: player.name,
            transcript,
            verdict,
            confidence,
            suggestedDelta,
        });

// ----- AUTO-RESOLVE AFTER JUDGEMENT (AI-hosted gameplay) -----
        if (verdict === "correct" || verdict === "incorrect") {
            await autoResolveAfterJudgement(ctx, gameId, game, player.name, verdict);
            return;
        }

    },

    "reset-buzzer": async ({ ws, data, ctx }) => {
        const { gameId } = data;
        const game = ctx.games[gameId];
        if (!game) return;
        if (!ctx.requireHost(game, ws)) return;

        game.buzzed = null;
        game.buzzerLocked = true;
        ctx.games[gameId].buzzLockouts = {};

        game.timerEndTime = null;

        game.timerVersion = (game.timerVersion || 0) + 1;

        ctx.broadcast(gameId, { type: "buzzer-ui-reset" });
        ctx.broadcast(gameId, { type: "buzzer-locked" });
        ctx.broadcast(gameId, { type: "timer-end", timerVersion: (ctx.games[gameId]?.timerVersion || 0) }); // client now clears on reset-buzzer anyway
    },

    "mark-all-complete": async ({ ws, data, ctx }) => {
        const { gameId } = data;
        const game = ctx.games[gameId];
        if (!game) return;
        if (!game.clearedClues) game.clearedClues = new Set();
        const boardKey = game.activeBoard || "firstBoard";
        const board = game.boardData?.[boardKey];
        if (!board?.categories) return;
        for (const cat of board.categories) {
            for (const clue of cat.values || []) {
                const clueId = `${clue.value}-${clue.question}`;
                game.clearedClues.add(clueId);
            }
        }
        // Broadcast an authoritative update that includes clearedClues
        ctx.broadcast(gameId, {
            type: "cleared-clues-sync",
            clearedClues: Array.from(game.clearedClues),
        });
        // If you're doing server-side auto transitions, trigger them here too
        // (use the same transition logic you use after clue-cleared)
        if (game.activeBoard === "firstBoard" && ctx.isBoardFullyCleared(game, "firstBoard")) {
            game.activeBoard = "secondBoard";
            ctx.broadcast(gameId, { type: "transition-to-second-board" });
        } else if (game.activeBoard === "secondBoard" && ctx.isBoardFullyCleared(game, "secondBoard")) {
            // however you start final jeopardy now
            ctx.startFinalJeopardy(gameId, game, ctx.broadcast);
        }

        console.error(`[Server] Game ID ${gameId} not found when marking all clues complete.`);

    },

    "trigger-game-over": async ({ ws, data, ctx }) => {
        const {gameId} = data;
        if (!ctx.requireHost(ctx.games[gameId], ws)) return;

        ctx.broadcast(gameId, {
            type: "game-over",
        });
    },
    "clue-selected": async ({ ws, data, ctx }) => {
        const { gameId, clue } = data;
        const game = ctx.games[gameId];
        if (!game) return;
        // Selector-only authority (AI-hosted game)
        const caller = ctx.getPlayerForSocket(game, ws);
        const callerStable = caller ? ctx.playerStableId(caller) : null;

        console.log("[CLUE SELECT ATTEMPT]", {
            phase: game.phase,
            selectorKey: game.selectorKey,
            selectorName: game.selectorName,
            callerStable,
            callerName: caller?.name,
        });

        if (game.phase !== "board") {
            console.warn("[CLUE SELECT BLOCKED] wrong phase");
            return;
        }

        if (!callerStable) {
            console.warn("[CLUE SELECT BLOCKED] no callerStable");
            return;
        }

        if (callerStable !== game.selectorKey) {
            console.warn("[CLUE SELECT BLOCKED] not selector");
            return;
        }


        // Any previous clue’s scheduled unlock should be canceled
        ctx.cancelAutoUnlock(game);

        game.selectedClue = {
            ...clue,
            isAnswerRevealed: false,
        };

        // ---- CLUE STATE START ----
        const boardKey = game.activeBoard || "firstBoard";
        const v = String(clue?.value ?? "");
        const q = String(clue?.question ?? "").trim();
        const clueKey = `${boardKey}:${v}:${q}`;

        game.phase = "clue";
        game.clueState = {
            clueKey,
            lockedOut: {},
        };


        // Reset buzzer state
        game.buzzed = null;
        game.buzzerLocked = true;
        game.buzzLockouts = {};

        ctx.broadcast(gameId, {
            type: "clue-selected",
            clue: game.selectedClue,
            clearedClues: Array.from(game.clearedClues),
        });

        ctx.broadcast(gameId, { type: "buzzer-ui-reset" });
        ctx.broadcast(gameId, { type: "buzzer-locked" });

        // --- AUTO UNLOCK AFTER TTS DURATION ---
        const narrationEnabled = Boolean(game?.lobbySettings?.narrationEnabled);
        if (!narrationEnabled) return;

        const ttsAssetId = game.boardData?.ttsByClueKey?.[clueKey] || null;

        await ctx.scheduleAutoUnlockForClue({
            gameId,
            game,
            clueKey,
            ttsAssetId,
        });
    },
    "reveal-answer": async ({ ws, data, ctx }) => {
        const { gameId } = data;
        const game = ctx.games[gameId];
        if (!game) return;
        if (!ctx.requireHost(game, ws)) return;

        ctx.clearAnswerWindow(game);
        game.phase = null;
        game.answeringPlayerKey = null;
        game.answerSessionId = null;
        game.answerClueKey = null;

        if (game.selectedClue) {
            game.selectedClue.isAnswerRevealed = true;
            ctx.broadcast(gameId, { type: "answer-revealed", clue: game.selectedClue });
        }
    },
    "return-to-board": async ({ data, ctx }) => {
        const { gameId } = data;
        const game = ctx.games[gameId];
        if (!game) return;

        ctx.clearAnswerWindow(game);
        game.phase = null;
        game.answeringPlayerKey = null;
        game.answerSessionId = null;
        game.answerClueKey = null;
        game.selectedClue = null;

        ctx.broadcast(gameId, {
            type: "returned-to-board",
            selectedClue: null,
        });
    },
    "clue-cleared": async ({ ws, data, ctx }) => {
        const { gameId, clueId } = data;

        if (ctx.games[gameId]) {
            const game = ctx.games[gameId];

            if (!game.clearedClues) game.clearedClues = new Set();
            game.clearedClues.add(clueId);

            ctx.broadcast(gameId, { type: "clue-cleared", clueId });

            if (game.activeBoard === "firstBoard" && ctx.isBoardFullyCleared(game, "firstBoard")) {
                game.activeBoard = "secondBoard";
                game.isFinalJeopardy = false;
                game.finalJeopardyStage = null;
                ctx.broadcast(gameId, { type: "transition-to-second-board" });
            }

            if (game.activeBoard === "secondBoard" && ctx.isBoardFullyCleared(game, "secondBoard")) {
                ctx.startFinalJeopardy(gameId, game, ctx.broadcast);
            }
        } else {
            console.error(`[Server] Game ID ${gameId} not found when clearing clue.`);
        }
    },
    "transition-to-second-board": async ({ ws, data, ctx }) => {
        const { gameId } = data;
        if (!ctx.requireHost(ctx.games[gameId], ws)) return;

        if (ctx.games[gameId]) {
            const game = ctx.games[gameId];
            game.activeBoard = "secondBoard";
            game.isFinalJeopardy = false;
            game.finalJeopardyStage = null;

            ctx.broadcast(gameId, { type: "transition-to-second-board" });
        } else {
            console.error(`[Server] Game ID ${gameId} not found for board transition.`);
        }
    },
    "update-score": async ({ ws, data, ctx }) => {
        const { gameId, player, delta } = data;
        const game = ctx.games[gameId];
        if (!game) return;

        const hostPlayer = game.players?.find(p => p.name === game.host);
        if (hostPlayer && hostPlayer.id !== ws.id) return;

        if (!game.scores) game.scores = {};
        game.scores[player] = (game.scores[player] || 0) + Number(delta || 0);

        ctx.broadcast(gameId, {
            type: "update-scores",
            scores: game.scores,
        });
    },
    "submit-wager": async ({ ws, data, ctx }) => {
        const {gameId, player, wager} = data;

        if (ctx.games[gameId]) {
            if (!ctx.games[gameId].wagers) {
                ctx.games[gameId].wagers = {};
            }
            ctx.games[gameId].wagers[player] = wager;

            ctx.broadcast(gameId, {
                type: "wager-update",
                player,
                wager,
            });

            const evt = ctx.checkAllWagersSubmitted(ctx.games[gameId]);
            if (evt) ctx.broadcast(gameId, evt);
        }
    },
    "transition-to-final-jeopardy": async ({ ws, data, ctx }) => {
        const { gameId } = data;

        if (ctx.games[gameId]) {
            const game = ctx.games[gameId];

            game.isFinalJeopardy = true;
            game.finalJeopardyStage = "wager"; // "wager" -> "drawing" -> "done"

            game.wagers = {};
            game.drawings = {};

            ctx.broadcast(gameId, { type: "final-jeopardy" });
        } else {
            console.error(`[Server] Game ID ${gameId} not found for board transition.`);
        }
    },
    "final-jeopardy-drawing": async ({ ws, data, ctx }) => {
        const {gameId, player, drawing} = data;

        if (ctx.games[gameId]) {
            // Initialize the drawings object if not present
            if (!ctx.games[gameId].drawings) {
                ctx.games[gameId].drawings = {};
            }

            // Parse the drawing if it’s a string
            let parsedDrawing;
            try {
                parsedDrawing = typeof drawing === 'string' ? JSON.parse(drawing) : drawing;
            } catch (error) {
                console.error(`[Server] Failed to parse drawing for player ${player}:`, error.message);
                return; // Exit early if the drawing can't be parsed
            }

            // Store the player's drawing as an object
            ctx.games[gameId].drawings[player] = parsedDrawing;

            // Broadcast that the player's drawing is submitted
            ctx.broadcast(gameId, {
                type: "final-jeopardy-drawing-submitted",
                player,
            });


            const evt = ctx.checkAllFinalDrawingsSubmitted(ctx.games[gameId]);
            if (evt) ctx.broadcast(gameId, evt);
        } else {
            console.error(`[Server] Game ID ${gameId} not found when submitting final jeopardy drawing.`);
        }
    },
    "tts-ensure": async ({ ws, data, ctx }) => {
        const { gameId, text, textType, voiceId, requestId } = data ?? {};

        if (!gameId || !text || !text.trim()) return;

        const game = ctx.games?.[gameId];
        if (!game) return;

        // 🔒 server-authoritative toggle
        if (!game.lobbySettings?.narrationEnabled) {
            ws.send(JSON.stringify({
                type: "tts-error",
                requestId,
                message: "Narration disabled"
            }));
            return;
        }

        // Optional: per-socket rate limit
        // if (!ctx.rateLimit(ws, "tts", 5, 60_000)) {
        //     ws.send(JSON.stringify({
        //         type: "tts-error",
        //         requestId,
        //         message: "TTS rate limit exceeded"
        //     }));
        //     return;
        // }

        const trace = ctx.createTrace("tts-ensure", { gameId });

        try {
            const asset = await ctx.ensureTtsAsset(
                {
                    text,
                    textType: textType || "text",
                    voiceId: voiceId || "Matthew",
                    engine: "standard",
                    outputFormat: "mp3",
                },
                ctx.supabase,
                trace
            );

            ws.send(JSON.stringify({
                type: "tts-ready",
                requestId,
                assetId: asset.id,
                url: `/api/tts/${asset.id}`,
            }));
        } catch (e) {
            console.error("tts-ensure failed:", e);
            ws.send(JSON.stringify({
                type: "tts-error",
                requestId,
                message: "Failed to generate narration"
            }));
        }
    },
};

function normUsername(u) {
    return String(u ?? "").trim().toLowerCase();
}

function pickDisplayname(d, fallbackUsername) {
    const s = String(d ?? "").trim();
    return s || fallbackUsername;
}

export const gameHandlers = {
    "join-game": async ({ ws, data, ctx }) => {
        const { gameId, username, displayname } = data ?? {};
        const u = normUsername(username);

        if (!u) {
            ws.send(JSON.stringify({ type: "error", message: "Username cannot be blank." }));
            return;
        }

        if (!ctx.games?.[gameId]) {
            ws.send(JSON.stringify({ type: "error", message: "Game does not exist!" }));
            return;
        }

        const game = ctx.games[gameId];

        // Find by username (canonical identity)
        let player = (game.players ?? []).find((p) => normUsername(p.username) === u);

        if (player) {
            // Reconnect
            console.log(`[Server] Player ${u} reconnected to Game ${gameId}`);
            player.id = ws.id;
            player.online = true;

            // Optionally refresh displayname if provided
            if (String(displayname ?? "").trim()) {
                player.displayname = String(displayname).trim();
            }

            ws.gameId = gameId;
        } else {
            // New player
            const profile = await ctx.repos.profiles.getPublicProfileByUsername(u);

            // Race condition check (still by username)
            player = (game.players ?? []).find((p) => normUsername(p.username) === u);
            if (player) {
                player.id = ws.id;
                player.online = true;
                ws.gameId = gameId;
            } else {
                const dn = pickDisplayname(displayname, profile?.displayname || u);

                const newPlayer = {
                    id: ws.id,
                    username: u,
                    displayname: dn,
                    color: profile?.color || "bg-blue-500",
                    text_color: profile?.text_color || "text-white",
                    online: true,
                };

                game.players.push(newPlayer);
                ws.gameId = gameId;
            }
        }

        const me =
            game.players.find((p) => p.id === ws.id) ||
            game.players.find((p) => normUsername(p.username) === u) ||
            null;

        const myUsername = normUsername(me?.username);
        const myLockoutUntil = myUsername ? (game.buzzLockouts?.[myUsername] || 0) : 0;

        // ---- derive DD rehydrate info (username-based)
        const dd = game.dailyDouble || null;
        const ddShowModal =
            dd && (game.phase === "DD_WAGER_CAPTURE" || dd.stage === "wager_listen")
                ? { playerUsername: dd.playerUsername, maxWager: dd.maxWager }
                : null;

        const finalists = Array.isArray(game.finalJeopardyFinalists) ? game.finalJeopardyFinalists : null;

        const fjDrawings =
            game.isFinalJeopardy && game.finalJeopardyStage === "finale" ? (game.drawings || {}) : null;

        ws.send(
            JSON.stringify({
                type: "game-state",
                gameId,

                players: game.players.map((p) => ({
                    username: p.username,
                    displayname: p.displayname,
                    online: p?.online !== false,
                })),

                host: game.host, // IMPORTANT: make this host USERNAME consistently
                buzzResult: game.buzzed, // should be username
                playerBuzzLockoutUntil: myLockoutUntil,

                clearedClues: Array.from(game.clearedClues || new Set()),
                boardData: game.boardData,
                selectedClue: game.selectedClue || null,
                buzzerLocked: game.buzzerLocked,
                scores: game.scores,

                timerEndTime: game.timerEndTime,
                timerDuration: game.timerDuration,
                timerVersion: game.timerVersion || 0,

                activeBoard: game.activeBoard || "firstBoard",

                // ---- Final Jeopardy rehydrate
                isFinalJeopardy: Boolean(game.isFinalJeopardy),
                finalJeopardyStage: game.finalJeopardyStage || null,
                wagers: game.wagers || {},
                finalists,
                drawings: fjDrawings,

                // ---- DD rehydrate
                dailyDouble: dd,
                ddWagerSessionId: game.ddWagerSessionId || null,
                ddWagerDeadlineAt: game.ddWagerDeadlineAt || null,
                ddShowModal,
                lobbySettings: game.lobbySettings || null,
                phase: game.phase || null,

                selectorKey: game.selectorKey || null,   // set to username
                selectorName: game.selectorName || null, // set to displayname

                boardSelectionLocked: Boolean(game.boardSelectionLocked),
                boardSelectionLockReason: game.boardSelectionLockReason || null,
                boardSelectionLockVersion: game.boardSelectionLockVersion || 0,

                welcomeTtsAssetId: game.welcomeTtsAssetId || null,
                welcomeEndsAt: typeof game.welcomeEndsAt === "number" ? game.welcomeEndsAt : null,

                answeringPlayer: game.answeringPlayerUsername || null, // rename in game state
                answerSessionId: game.answerSessionId || null,
                answerDeadlineAt: game.answerDeadlineAt || null,
                answerClueKey: game.answerClueKey || null,
            })
        );

        // Notify others (consistent payload)
        ctx.broadcast(gameId, {
            type: "player-list-update",
            players: game.players.map((p) => ({
                username: p.username,
                displayname: p.displayname,
                online: p?.online !== false,
            })),
            host: game.host,
        });
    },

    "leave-game": async ({ ws, data, ctx }) => {
        const { gameId, username } = data ?? {};
        if (!gameId || !ctx.games?.[gameId]) return;

        const game = ctx.games[gameId];

        const u = normUsername(username);

        const leavingPlayer =
            (u && game.players.find((p) => normUsername(p.username) === u)) ||
            game.players.find((p) => p.id === ws.id);

        if (!leavingPlayer) return;

        const leavingUsername = normUsername(leavingPlayer.username);

        // HARD REMOVE from players
        game.players = game.players.filter((p) => normUsername(p.username) !== leavingUsername);

        // PURGE per-player state
        if (game.wagers) delete game.wagers[leavingUsername];
        if (game.drawings) delete game.drawings[leavingUsername];
        if (game.scores) delete game.scores[leavingUsername];
        if (game.buzzLockouts) delete game.buzzLockouts[leavingUsername];

        // If host left, reassign (or delete if empty)
        if (normUsername(game.host) === leavingUsername) {
            if (game.players.length === 0) {
                delete ctx.games[gameId];
                return;
            }
            game.host = normUsername(game.players[0].username); // host = username
        }

        ws.gameId = null;

        ctx.broadcast(gameId, {
            type: "player-list-update",
            players: game.players.map((p) => ({
                username: p.username,
                displayname: p.displayname,
                online: p?.online !== false,
            })),
            host: game.host,
        });

        ctx.checkAllWagersSubmitted(game, gameId, ctx);
        ctx.checkAllDrawingsSubmitted(game, gameId, ctx);
    },

    "buzz": async ({ ws, data, ctx }) => {
        const { gameId } = data;
        const game = ctx.games?.[gameId];
        if (!game) return;

        const player = game.players.find((p) => p.id === ws.id);
        if (!player?.username) return;

        const stable = ctx.playerStableId(player); // should be normalized username
        if (!stable) return;

        const lockedOut = game.clueState?.lockedOut || {};
        if (game.clueState?.clueKey && lockedOut[stable]) {
            ws.send(JSON.stringify({
                type: "buzz-denied",
                reason: "already-attempted",
                lockoutUntil: 0,
            }));
            return;
        }

        ctx.fireAndForget(ctx.repos.profiles.incrementTotalBuzzes(stable), "Increment total buzzes");

        if (!game.buzzLockouts) game.buzzLockouts = {};

        const now = Date.now();
        const lockoutUntil = game.buzzLockouts[stable] || 0;

        // Strict arrival ordering even if same ms
        if (!game._buzzMsgSeq) game._buzzMsgSeq = 0;
        const msgSeq = ++game._buzzMsgSeq;

        // Already buzzed by someone else
        if (game.buzzed) {
            ws.send(JSON.stringify({
                type: "buzz-denied",
                reason: "already-buzzed",
                lockoutUntil,
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
            const EARLY_BUZZ_LOCKOUT_MS = 1000;
            const until = now + EARLY_BUZZ_LOCKOUT_MS;
            game.buzzLockouts[stable] = until;

            ws.send(JSON.stringify({
                type: "buzz-denied",
                reason: "early",
                lockoutUntil: until,
            }));
            return;
        }

        // ---------------------------
        // Fair buzz selection
        // ---------------------------

        const estRaw = Number(data?.estimatedServerBuzzAtMs);
        const looksLikeEpochMs = Number.isFinite(estRaw) && estRaw >= 1_000_000_000_000;
        const est = looksLikeEpochMs ? estRaw : now;

        if (looksLikeEpochMs) {
            const openAt = Number(game?.clueState?.buzzOpenAtMs || 0);
            const MAX_EARLY_MS = 50;
            const MAX_FUTURE_MS = 250;

            if (openAt > 0 && est < openAt - MAX_EARLY_MS) {
                ws.send(JSON.stringify({ type: "buzz-denied", reason: "bad-timestamp", lockoutUntil: 0 }));
                return;
            }

            if (est > now + MAX_FUTURE_MS) {
                ws.send(JSON.stringify({ type: "buzz-denied", reason: "bad-timestamp", lockoutUntil: 0 }));
                return;
            }
        }

        const COLLECT_MS = 50;
        const EPS_MS = 5;

        if (!game.pendingBuzz) {
            game.pendingBuzz = {
                deadline: now + COLLECT_MS,
                candidates: [],
                timer: null,
            };

            game.pendingBuzz.timer = setTimeout(async () => {
                const g = ctx.games?.[gameId];
                if (!g || !g.pendingBuzz) return;

                if (g.buzzed || g.buzzerLocked) {
                    try { if (g.pendingBuzz.timer) clearTimeout(g.pendingBuzz.timer); } catch {}
                    g.pendingBuzz = null;
                    return;
                }

                const candidates = g.pendingBuzz.candidates || [];
                g.pendingBuzz = null;

                if (candidates.length === 0) return;

                candidates.sort((a, b) => {
                    const dt = a.est - b.est;
                    if (Math.abs(dt) <= EPS_MS) {
                        const da = a.arrival - b.arrival;
                        if (da !== 0) return da;
                        return (a.msgSeq || 0) - (b.msgSeq || 0);
                    }
                    return dt;
                });

                const winner = candidates[0];
                if (!winner?.playerUsername) return;

                // Accept winner
                g.buzzed = winner.playerUsername;

                ctx.fireAndForget(ctx.repos.profiles.incrementTimesBuzzed(winner.playerUsername), "Increment buzzes won");

                ctx.broadcast(gameId, {
                    type: "buzz-result",
                    username: winner.playerUsername,
                    displayname: winner.playerDisplayname,
                });

                g.buzzerLocked = true;
                ctx.broadcast(gameId, { type: "buzzer-locked" });

                await ctx.aiHostSayByKey(ctx, gameId, g, winner.playerDisplayname);

                const startCaptureAfterMs = 0;

                setTimeout(() => {
                    const gg = ctx.games?.[gameId];
                    if (!gg) return;

                    const ANSWER_SECONDS =
                        typeof gg.timeToAnswer === "number" && gg.timeToAnswer > 0
                            ? gg.timeToAnswer
                            : 9;

                    const RECORD_MS = ANSWER_SECONDS * 1000;

                    // Ensure we're still on same buzz & clue
                    if (gg.buzzed !== winner.playerUsername) return;

                    const boardKey = gg.activeBoard || "firstBoard";
                    const v = String(gg.selectedClue?.value ?? "");
                    const q = String(gg.selectedClue?.question ?? "").trim();
                    const clueKey = `${boardKey}:${v}:${q}`;

                    gg.phase = "ANSWER_CAPTURE";
                    gg.answeringPlayerUsername = winner.playerUsername;
                    gg.answerClueKey = clueKey;
                    gg.answerSessionId = `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
                    gg.answerTranscript = null;
                    gg.answerVerdict = null;
                    gg.answerConfidence = null;

                    ctx.clearAnswerWindow(gg);

                    const deadlineAt = Date.now() + RECORD_MS;

                    ctx.broadcast(gameId, {
                        type: "answer-capture-start",
                        gameId,
                        username: winner.playerUsername,
                        displayname: winner.playerDisplayname ?? null,
                        answerSessionId: gg.answerSessionId,
                        clueKey,
                        durationMs: RECORD_MS,
                        deadlineAt,
                    });

                    if (ANSWER_SECONDS > 0) {
                        ctx.startGameTimer(gameId, gg, ctx, ANSWER_SECONDS, "answer");
                    }

                    ctx.startAnswerWindow(gameId, gg, ctx.broadcast, RECORD_MS, () => {
                        const ggg = ctx.games?.[gameId];
                        if (!ggg) return;

                        if (!ggg.answerSessionId) return;
                        if (ggg.answerSessionId !== gg.answerSessionId) return;
                        if (ggg.answeringPlayerUsername !== winner.playerUsername) return;
                        if (!ggg.selectedClue) return;

                        ggg.phase = "RESULT";
                        ggg.answerTranscript = "";
                        ggg.answerVerdict = "incorrect";
                        ggg.answerConfidence = 0.0;

                        const clueValue = ctx.parseClueValue(ggg.selectedClue?.value);

                        ctx.broadcast(gameId, {
                            type: "answer-result",
                            gameId,
                            answerSessionId: ggg.answerSessionId,
                            username: winner.playerUsername,
                            displayname: winner.playerDisplayname ?? null,
                            transcript: "",
                            verdict: "incorrect",
                            confidence: 0.0,
                            suggestedDelta: -clueValue,
                        });

                        ctx.autoResolveAfterJudgement(ctx, gameId, ggg, winner.playerUsername, "incorrect")
                            .catch((e) => console.error("[answer-timeout] autoResolve failed:", e));
                    });
                }, startCaptureAfterMs);
            }, COLLECT_MS);
        }

        // Add candidate to pending list
        const clientSeq = Number(data?.clientSeq || 0);

        // Dedupe: avoid multiple from same player
        const already = game.pendingBuzz.candidates.find((c) => c.playerUsername === stable);
        if (!already) {
            game.pendingBuzz.candidates.push({
                playerUsername: stable,
                playerDisplayname: String(player.displayname ?? "").trim() || stable,
                est,
                arrival: now,
                clientSeq,
                msgSeq,
            });
        }
    },

    "dd-snipe-next": async ({ ws, data, ctx }) => {
        const { gameId, enabled } = data || {};
        const game = ctx.games?.[gameId];
        if (!game) return;

        game.ddSnipeNext = Boolean(enabled);

        ctx.broadcast(gameId, {
            type: "dd-snipe-next-set",
            enabled: Boolean(game.ddSnipeNext),
        });
    },

    "unlock-buzzer": async ({ ws, data, ctx }) => {
        const { gameId } = data;
        const game = ctx.games[gameId];
        if (!game) return;
        if (!ctx.requireHost(game, ws)) return;

        ctx.cancelAutoUnlock(game);

        ctx.doUnlockBuzzerAuthoritative(gameId, game, ctx);
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
        const norm = (v) => String(v ?? "").trim().toLowerCase();
        const player = game.players?.find((p) => p.id === ws.id);
        const playerDisplayname = String(player?.displayname ?? "").trim() || null;
        const playerUsername = norm(player?.username);

        console.log(game.phase);
        // Must be in capture phase
        if (game.phase !== "ANSWER_CAPTURE") {
            ws.send(JSON.stringify({
                type: "answer-error",
                gameId,
                answerSessionId,
                message: `Not accepting answers right now (phase=${String(game.phase)}, buzzed=${String(game.buzzed)}, selectedClue=${Boolean(game.selectedClue)})`,
            }));
            return ctx.autoResolveAfterJudgement(ctx, gameId, game, playerUsername, "incorrect")
                .catch((e) => console.error("[answer-audio-blob] autoResolve failed:", e));
        }

        // Session must match (stale protection)
        if (!answerSessionId || answerSessionId !== game.answerSessionId) {
            ws.send(JSON.stringify({
                type: "answer-error",
                gameId,
                answerSessionId,
                message: "Stale or invalid answer session.",
            }));
            return ctx.autoResolveAfterJudgement(ctx, gameId, game, playerUsername, "incorrect")
                .catch((e) => console.error("[answer-audio-blob] autoResolve failed:", e));
        }



        const answeringUsername = norm(game.answeringPlayerUsername); // rename this in game state
        if (!playerUsername || !answeringUsername || playerUsername !== answeringUsername) {
            ws.send(JSON.stringify({
                type: "answer-error",
                gameId,
                answerSessionId,
                message: "You are not the answering player.",
            }));
            return ctx.autoResolveAfterJudgement(ctx, gameId, game, playerUsername, "incorrect")
                .catch((e) => console.error("[answer-audio-blob] autoResolve failed:", e));
        }

        // Basic payload validation / size limits
        if (typeof dataBase64 !== "string" || !dataBase64.trim()) {
            ws.send(JSON.stringify({
                type: "answer-error",
                gameId,
                answerSessionId,
                message: "Missing audio data.",
            }));
            return ctx.autoResolveAfterJudgement(ctx, gameId, game, playerUsername, "incorrect")
                .catch((e) => console.error("[answer-audio-blob] autoResolve failed:", e));
        }

        // Decode base64
        let buf;
        try {
            buf = Buffer.from(dataBase64, "base64");
        } catch {
            ws.send(JSON.stringify({
                type: "answer-error",
                gameId,
                answerSessionId,
                message: "Invalid base64 audio.",
            }));
            return ctx.autoResolveAfterJudgement(ctx, gameId, game, playerUsername, "incorrect")
                .catch((e) => console.error("[answer-audio-blob] autoResolve failed:", e));
        }

        // Hard cap: keep small to avoid WS abuse (tune later)
        const MAX_BYTES = 2_000_000; // 2MB
        if (buf.length > MAX_BYTES) {
            ws.send(JSON.stringify({
                type: "answer-error",
                gameId,
                answerSessionId,
                message: "Audio too large.",
            }));
            return ctx.autoResolveAfterJudgement(ctx, gameId, game, playerUsername, "incorrect")
                .catch((e) => console.error("[answer-audio-blob] autoResolve failed:", e));
        }

        // Stop the answer window (prevents timeout firing)
        ctx.clearAnswerWindow(game);

        ctx.broadcast(gameId, { type: "answer-capture-ended", gameId, answerSessionId });

        // Move to judging phase
        game.phase = "JUDGING";

        ctx.broadcast(gameId, {
            type: "answer-processing",
            gameId,
            answerSessionId,
            playerUsername,
            playerDisplayname,
            stage: "transcribing",
        });

        // --- STT ---
        let transcript = "";
        try {
            const stt = await ctx.transcribeAnswerAudio(buf, mimeType, game.selectedClue?.answer);
            transcript = String(stt || "").trim();

            if (!transcript) {
                const parseValue = (val) => {
                    const n = Number(String(val || "").replace(/[^0-9]/g, ""));
                    return Number.isFinite(n) ? n : 0;
                };

                const ddWorth =
                    game.dailyDouble?.clueKey === game.clueState?.clueKey &&
                    Number.isFinite(Number(game.dailyDouble?.wager))
                        ? Number(game.dailyDouble.wager)
                        : null;

                const worth = ddWorth !== null ? ddWorth : parseValue(game.selectedClue?.value);

                game.phase = "RESULT";
                game.answerTranscript = "";
                game.answerVerdict = "incorrect";
                game.answerConfidence = 0.0;

                ctx.broadcast(gameId, {
                    type: "answer-result",
                    gameId,
                    answerSessionId,
                    username: playerUsername,
                    displayname: playerDisplayname,
                    transcript: "",
                    verdict: "incorrect",
                    confidence: 0.0,
                    suggestedDelta: -worth,
                });

                return ctx.autoResolveAfterJudgement(ctx, gameId, game, playerUsername, "incorrect")
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
                username: playerUsername,
                displayname: playerDisplayname,
                transcript: "",
                verdict: "incorrect",
                confidence: 0.0,
                suggestedDelta: -clueValue,
            });

            return ctx.autoResolveAfterJudgement(ctx, gameId, game, playerUsername, "incorrect")
                .catch((err) => console.error("[answer-audio-blob-error] autoResolve failed:", err));
        }

        ctx.broadcast(gameId, {
            type: "answer-transcript",
            gameId,
            answerSessionId,
            playerUsername,
            playerDisplayname,
            transcript,
            isFinal: true,
        });

        // --- JUDGE ---
        let verdict;
        try {
            const expectedAnswer = String(game.selectedClue?.answer || "");
            verdict = (await ctx.judgeClueAnswerFast(expectedAnswer, transcript, game.selectedClue.question)).verdict;
        } catch (e) {
            console.error("[answer-audio-blob] judge failed:", e?.message || e);
            verdict = "incorrect";
        }

        const clueValue = ctx.parseClueValue(game.selectedClue?.value);

        const ddWorth =
            game.dailyDouble?.clueKey === game.clueState?.clueKey &&
            Number.isFinite(Number(game.dailyDouble?.wager))
                ? Number(game.dailyDouble.wager)
                : null;

        const worth = ddWorth !== null ? ddWorth : clueValue;

        const suggestedDelta =
            verdict === "correct" ? worth :
                verdict === "incorrect" ? -worth :
                    0;

        game.phase = "RESULT";
        game.answerTranscript = transcript;
        game.answerVerdict = verdict;

        ctx.broadcast(gameId, {
            type: "answer-result",
            gameId,
            answerSessionId,
            username: playerUsername,
            displayname: playerDisplayname,
            transcript,
            verdict,
            suggestedDelta,
        });

        return ctx.autoResolveAfterJudgement(ctx, gameId, game, playerUsername, verdict)
            .catch((e) => console.error("[answer-audio-blob] autoResolve failed:", e));
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

        ctx.checkBoardTransition(game, gameId, ctx);
    },

    "clue-selected": async ({ ws, data, ctx }) => {
        const { gameId, clue } = data;
        const game = ctx.games?.[gameId];
        if (!game) return;

        const norm = (v) => String(v ?? "").trim().toLowerCase();

        const caller = ctx.getPlayerForSocket(game, ws);
        const callerStable = caller ? norm(ctx.playerStableId(caller)) : null; // username
        const callerDisplay = String(caller?.displayname ?? "").trim() || (callerStable ?? null);



        console.log("[CLUE SELECT ATTEMPT]", {
            phase: game.phase,
            selectorKey: game.selectorKey,     // username
            selectorName: game.selectorName,   // displayname
            callerStable,                      // username
            callerDisplayname: callerDisplay,  // displayname
        });

        if (game.phase !== "board") {
            console.warn("[CLUE SELECT BLOCKED] wrong phase");
            return;
        }

        if (game.boardSelectionLocked) {
            console.warn("[CLUE SELECT BLOCKED] board selection locked", {
                reason: game.boardSelectionLockReason,
                lockVersion: game.boardSelectionLockVersion,
            });
            return;
        }

        if (!callerStable) {
            console.warn("[CLUE SELECT BLOCKED] no callerStable");
            return;
        }

        // selectorKey should be username (normalized)
        if (callerStable !== norm(game.selectorKey)) {
            console.warn("[CLUE SELECT BLOCKED] not selector");
            return;
        }

        // Any previous clue’s scheduled unlock should be canceled
        ctx.cancelAutoUnlock(game);

        ctx.fireAndForget(ctx.repos.profiles.incrementCluesSelected(callerStable), "Increment Clues");

        const category =
            String(clue?.category ?? "").trim() ||
            ctx.findCategoryForClue(game, clue);

        game.selectedClue = {
            ...clue,
            category: category || undefined,
            isAnswerRevealed: false,
        };

        // ---- CLUE STATE START ----
        const boardKey = game.activeBoard || "firstBoard";
        const v = String(clue?.value ?? "");
        const q = String(clue?.question ?? "").trim();
        const clueKey = `${boardKey}:${v}:${q}`;

        const ddKeys = game.boardData?.dailyDoubleClueKeys?.[boardKey] || [];
        const naturalDD = ddKeys.includes(clueKey) && !(game.usedDailyDoubles?.has?.(clueKey));
        const snipedDD = Boolean(game.ddSnipeNext);

        const isDailyDouble = naturalDD || snipedDD;

        if (snipedDD) {
            game.ddSnipeNext = false; // consume the snipe
            ctx.broadcast(gameId, { type: "dd-snipe-consumed", clueKey });
        }

        game.phase = "clue";
        game.clueState = {
            clueKey,
            lockedOut: {}, // should be keyed by username
        };

        // Reset buzzer state
        game.buzzed = null;          // should be username
        game.buzzerLocked = true;
        game.buzzLockouts = {};      // keyed by username

        const pad = 25;
        const ttsAssetId = game.boardData?.ttsByClueKey?.[clueKey] || null;

        const broadcastClueSelected = () => {
            ctx.broadcast(gameId, { type: "buzzer-ui-reset" });
            ctx.broadcast(gameId, { type: "buzzer-locked" });
            ctx.broadcast(gameId, {
                type: "clue-selected",
                clue: game.selectedClue,
                clearedClues: Array.from(game.clearedClues),
            });
        };

        if (isDailyDouble) {
            if (!game.usedDailyDoubles) game.usedDailyDoubles = new Set();

            // Selector identity:
            const playerUsername = norm(game.selectorKey);                // canonical
            const playerDisplayname = String(game.selectorName ?? "").trim() || playerUsername;

            ctx.fireAndForget(ctx.repos.profiles.incrementDailyDoubleFound(playerUsername), "Increment Daily Double found");


            const maxWager = ctx.computeDailyDoubleMaxWager(game, boardKey, playerUsername);

            // Store DD state username-first
            game.dailyDouble = {
                clueKey,
                boardKey,
                playerUsername,
                playerDisplayname,
                stage: "wager_listen",
                wager: null,
                maxWager,
                attempts: 0,
            };

            const showModal = () => {
                ctx.broadcast(gameId, {
                    type: "daily-double-show-modal",
                    username: playerUsername,
                    displayname: playerDisplayname,
                    maxWager,
                });
            };

            // IMPORTANT: do NOT start mic yet. Speak first.
            // If your TTS "slot" system expects a name to speak, use displayname.
            await ctx.aiHostVoiceSequence(ctx, gameId, game, [
                { slot: "daily_double", after: showModal },
                { slot: playerDisplayname },
                { slot: "daily_double2" },
                { slot: "single_wager" },
            ]);

            // Now start capture (this broadcasts capture-start + arms timeout reprompt)
            ctx.startDdWagerCapture(gameId, game, ctx);

            return; // IMPORTANT: do not unlock buzzers
        }

        // Normal (non-DD) path:
        await ctx.aiHostVoiceSequence(ctx, gameId, game, [
            { slot: game.selectedClue.category, pad },
            { slot: game.selectedClue.value, after: broadcastClueSelected },
            { assetId: ttsAssetId },
        ]);

        ctx.doUnlockBuzzerAuthoritative(gameId, game, ctx);
    },

    "daily-double-wager-audio-blob": async ({ ws, data, ctx }) => {
        const { gameId, ddWagerSessionId, mimeType, dataBase64 } = data || {};
        const game = ctx.games?.[gameId];
        if (!game) return;

        const norm = (v) => String(v ?? "").trim().toLowerCase();

        // Must be in DD wager capture phase
        if (game.phase !== "DD_WAGER_CAPTURE") {
            ws.send(JSON.stringify({
                type: "daily-double-error",
                gameId,
                ddWagerSessionId,
                message: `Not accepting DD wagers right now (phase=${String(game.phase)})`,
            }));
            return;
        }

        // Session must match (stale protection)
        if (!ddWagerSessionId || ddWagerSessionId !== game.ddWagerSessionId) {
            ws.send(JSON.stringify({
                type: "daily-double-error",
                gameId,
                ddWagerSessionId,
                message: "Stale or invalid DD wager session.",
            }));
            return;
        }

        // Only the DD player may submit (username-based)
        const player = game.players?.find((p) => p.id === ws.id);
        const playerUsername = norm(player?.username);
        const playerDisplayname = String(player?.displayname ?? "").trim() || null;

        const ddPlayerUsername = norm(game.dailyDouble?.playerUsername);
        if (!playerUsername || !ddPlayerUsername || playerUsername !== ddPlayerUsername) {
            ws.send(JSON.stringify({
                type: "daily-double-error",
                gameId,
                ddWagerSessionId,
                message: "You are not the Daily Double player.",
            }));
            return;
        }

        if (typeof dataBase64 !== "string" || !dataBase64.trim()) {
            ws.send(JSON.stringify({
                type: "daily-double-error",
                gameId,
                ddWagerSessionId,
                message: "Missing audio data.",
            }));
            return;
        }

        // Decode base64
        let buf;
        try {
            buf = Buffer.from(dataBase64, "base64");
        } catch {
            ws.send(JSON.stringify({
                type: "daily-double-error",
                gameId,
                ddWagerSessionId,
                message: "Invalid base64 audio.",
            }));
            return;
        }

        const MAX_BYTES = 2_000_000;
        if (buf.length > MAX_BYTES) {
            ws.send(JSON.stringify({
                type: "daily-double-error",
                gameId,
                ddWagerSessionId,
                message: "Audio too large.",
            }));
            return;
        }

        ctx.clearDdWagerTimer(ctx, gameId, game);

        // --- STT (no expected answer context for wagering) ---
        let transcript = "";
        try {
            const stt = await ctx.transcribeAnswerAudio(buf, mimeType, null);
            transcript = String(stt || "").trim();
        } catch (e) {
            console.error("[dd-wager] STT failed:", e?.message || e);
            ws.send(JSON.stringify({
                type: "daily-double-error",
                gameId,
                ddWagerSessionId,
                message: "STT failed",
            }));
            return;
        }

        const dd = game.dailyDouble;
        const maxWager = Number(dd?.maxWager || 0);

        const parsed = await ctx.parseDailyDoubleWager({
            transcriptRaw: transcript,
            maxWager,
        });

        const wager = parsed.wager;
        const reason = parsed.reason;

        ctx.broadcast(gameId, {
            type: "daily-double-wager-heard",
            gameId,
            username: playerUsername,
            displayname: playerDisplayname,
            transcript,
            parsedWager: wager,
            reason,
            maxWager,
        });

        if (wager === null) {
            await ctx.repromptDdWager(gameId, game, ctx, { reason: reason || "no-number" });
            return;
        }

        // Lock wager + mark DD used
        dd.wager = wager;
        dd.stage = "clue";
        if (!game.usedDailyDoubles) game.usedDailyDoubles = new Set();
        game.usedDailyDoubles.add(dd.clueKey);

        // Exit wager capture phase
        game.phase = "clue";
        game.ddWagerSessionId = null;
        game.ddWagerDeadlineAt = null;

        ctx.broadcast(gameId, {
            type: "daily-double-wager-locked",
            gameId,
            username: playerUsername,
            displayname: playerDisplayname,
            wager,
        });

        return await ctx.finalizeDailyDoubleWagerAndStartClue(gameId, game, ctx, {
            username: playerUsername,
            displayname: playerDisplayname,
            wager,
            fallback: false,
            reason: null,
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

    "update-score": async ({ ws, data, ctx }) => {
        const { gameId, username, delta } = data;
        const game = ctx.games[gameId];
        if (!game) return;

        if (!game.scores) game.scores = {};
        game.scores[username] = (game.scores[username] || 0) + Number(delta || 0);

        ctx.broadcast(gameId, {
            type: "update-scores",
            scores: game.scores,
        });
    },
    "submit-wager": async ({ ws, data, ctx }) => {
        const {gameId, player, wager} = data;
        const game = ctx.games[gameId];

        if (game) {
            await ctx.submitWager(game, gameId, player, wager, ctx);
        }
    },
    "submit-drawing": async ({ ws, data, ctx }) => {
        const {gameId, player, drawing} = data;
        const game = ctx.games[gameId];

        if (game) {
            await ctx.submitDrawing(game, gameId, player, drawing, ctx);
        }
    },
    "tts-ensure": async ({ ws, data, ctx }) => {
        const { gameId, text, textType, voiceId, requestId } = data ?? {};

        if (!gameId || !text || !text.trim()) return;

        const game = ctx.games?.[gameId];
        if (!game) return;

        if (!game.lobbySettings?.narrationEnabled) {
            ws.send(JSON.stringify({
                type: "tts-error",
                requestId,
                message: "Narration disabled"
            }));
            return;
        }

        try {
            const asset = await ctx.ensureTtsAsset(
                {
                    text,
                    textType: textType || "text",
                    voiceId: voiceId || "amy",
                    engine: "standard",
                    outputFormat: "mp3",
                    provider: "piper"
                },
                ctx.repos
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

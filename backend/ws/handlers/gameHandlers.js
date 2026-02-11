import {doUnlockBuzzerAuthoritative} from "../../game/gameLogic.js";

function buzzLog(gameId, msg, extra) {
    console.log(`[buzz] ${msg}`, { t: Date.now(), gameId, ...extra });
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
            boardSelectionLocked: Boolean(game.boardSelectionLocked),
            boardSelectionLockReason: game.boardSelectionLockReason || null,
            boardSelectionLockVersion: game.boardSelectionLockVersion || 0,
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
        ctx.checkAllWagersSubmitted(game, gameId, ctx);

        ctx.checkAllDrawingsSubmitted(game, gameId, ctx);

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
            buzzLog(gameId, "deny already-attempted", {
                wsId: ws.id,
                playerName: player.name,
                stableId: stable,
                clueKey: game.clueState?.clueKey ?? null,
            });

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

        // Strict arrival ordering even if same ms
        if (!game._buzzMsgSeq) game._buzzMsgSeq = 0;
        const msgSeq = ++game._buzzMsgSeq;

        buzzLog(gameId, "recv", {
            msgSeq,
            wsId: ws.id,
            playerName: player.name,
            stableId: stable,
            buzzerLocked: Boolean(game.buzzerLocked),
            buzzed: game.buzzed || null,
            estRaw: data?.estimatedServerBuzzAtMs ?? null,
            clientSeq: data?.clientSeq ?? null,
            lockoutUntil,
            lockoutRemainingMs: Math.max(0, lockoutUntil - now),
            now,
        });

        // Already buzzed by someone else
        if (game.buzzed) {
            buzzLog(gameId, "deny already-buzzed", {
                msgSeq,
                playerName: player.name,
                currentWinner: game.buzzed,
                lockoutUntil,
                now,
            });

            ws.send(JSON.stringify({
                type: "buzz-denied",
                reason: "already-buzzed",
                lockoutUntil: lockoutUntil,
            }));
            return;
        }

        // Player is currently locked out (from early buzzing)
        if (lockoutUntil > now) {
            buzzLog(gameId, "deny locked-out", {
                msgSeq,
                playerName: player.name,
                lockoutUntil,
                remainingMs: lockoutUntil - now,
                now,
            });

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
            game.buzzLockouts[player.name] = until;

            buzzLog(gameId, "deny early", {
                msgSeq,
                playerName: player.name,
                now,
                until,
                earlyLockoutMs: EARLY_BUZZ_LOCKOUT_MS,
            });

            ws.send(JSON.stringify({
                type: "buzz-denied",
                reason: "early",
                lockoutUntil: until,
            }));
            return;
        }

        // ---------------------------
        // Fair buzz selection (Step 4)
        // ---------------------------

        // Client-provided estimate of server epoch time when they buzzed
        // If missing, fall back to arrival time (still works)
        const estRaw = Number(data?.estimatedServerBuzzAtMs);

        // treat as “provided” only if it looks like epoch ms (>= ~2001-09-09)
        const looksLikeEpochMs = Number.isFinite(estRaw) && estRaw >= 1_000_000_000_000;

        const est = looksLikeEpochMs ? estRaw : now;

        // Optional: basic sanity checks to prevent obviously fake timestamps
        // Requires you set this when you unlock buzzer:
        //   game.clueState.buzzOpenAtMs = Date.now();
        if (looksLikeEpochMs) {
            const openAt = Number(game?.clueState?.buzzOpenAtMs || 0);
            const MAX_EARLY_MS = 50;
            const MAX_FUTURE_MS = 250;

            if (openAt > 0 && est < openAt - MAX_EARLY_MS) {
                buzzLog(gameId, "deny bad-timestamp (early)", {
                    msgSeq,
                    playerName: player.name,
                    est,
                    openAt,
                    now,
                    maxEarlyMs: MAX_EARLY_MS,
                });

                ws.send(JSON.stringify({ type: "buzz-denied", reason: "bad-timestamp", lockoutUntil: 0 }));
                return;
            }

            if (est > now + MAX_FUTURE_MS) {
                buzzLog(gameId, "deny bad-timestamp (future)", {
                    msgSeq,
                    playerName: player.name,
                    est,
                    now,
                    maxFutureMs: MAX_FUTURE_MS,
                });

                ws.send(JSON.stringify({ type: "buzz-denied", reason: "bad-timestamp", lockoutUntil: 0 }));
                return;
            }
        }

        // Init pending window on first buzz
        const COLLECT_MS = 50;
        const EPS_MS = 5; // tie threshold: within this, break by arrival time

        if (!game.pendingBuzz) {
            game.pendingBuzz = {
                deadline: now + COLLECT_MS,
                candidates: [],
                timer: null,
            };

            buzzLog(gameId, "pending-init", {
                msgSeq,
                now,
                collectMs: COLLECT_MS,
                deadline: game.pendingBuzz.deadline,
                epsMs: EPS_MS,
            });

            game.pendingBuzz.timer = setTimeout(async () => {
                const g = ctx.games?.[gameId];
                if (!g || !g.pendingBuzz) return;

                // If buzzer got locked / winner set some other way, drop it
                if (g.buzzed || g.buzzerLocked) {
                    buzzLog(gameId, "pending-drop (already resolved)", {
                        now: Date.now(),
                        buzzed: g.buzzed || null,
                        buzzerLocked: Boolean(g.buzzerLocked),
                    });

                    try { if (g.pendingBuzz.timer) clearTimeout(g.pendingBuzz.timer); } catch {}
                    g.pendingBuzz = null;
                    return;
                }

                const candidates = g.pendingBuzz.candidates || [];

                buzzLog(gameId, "pending-fire", {
                    now: Date.now(),
                    deadline: g.pendingBuzz.deadline,
                    lateByMs: Math.max(0, Date.now() - g.pendingBuzz.deadline),
                    candidateCount: candidates.length,
                });

                g.pendingBuzz = null;

                if (candidates.length === 0) return;

                buzzLog(gameId, "candidates-unsorted", {
                    epsMs: EPS_MS,
                    candidates: candidates.map((c) => ({
                        playerName: c.playerName,
                        est: c.est,
                        arrival: c.arrival,
                        msgSeq: c.msgSeq,
                        clientSeq: c.clientSeq,
                        arrivalMinusEst: c.arrival - c.est,
                    })),
                });

                candidates.sort((a, b) => {
                    const dt = a.est - b.est;
                    if (Math.abs(dt) <= EPS_MS) {
                        const da = a.arrival - b.arrival;
                        if (da !== 0) return da;
                        // last-resort deterministic tie-break
                        return (a.msgSeq || 0) - (b.msgSeq || 0);
                    }
                    return dt;
                });

                buzzLog(gameId, "candidates-sorted", {
                    epsMs: EPS_MS,
                    sorted: candidates.map((c) => ({
                        playerName: c.playerName,
                        est: c.est,
                        arrival: c.arrival,
                        msgSeq: c.msgSeq,
                        clientSeq: c.clientSeq,
                        arrivalMinusEst: c.arrival - c.est,
                    })),
                });

                const winner = candidates[0];
                if (!winner?.playerName) return;

                buzzLog(gameId, "winner-selected", {
                    winner: winner.playerName,
                    winnerEst: winner.est,
                    winnerArrival: winner.arrival,
                    winnerMsgSeq: winner.msgSeq,
                    winnerClientSeq: winner.clientSeq,
                    now: Date.now(),
                });

                // Accept winner (same as your old "Accept buzz" block)
                g.buzzed = winner.playerName;
                ctx.broadcast(gameId, { type: "buzz-result", playerName: winner.playerName });

                g.buzzerLocked = true;
                ctx.broadcast(gameId, { type: "buzzer-locked" });

                buzzLog(gameId, "buzzer-locked-after-winner", {
                    winner: winner.playerName,
                    now: Date.now(),
                });

                await ctx.aiHostSayByKey(ctx, gameId, g, winner.playerName);

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
                    if (gg.buzzed !== winner.playerName) return;

                    // Start server-authoritative answer capture session
                    const boardKey = gg.activeBoard || "firstBoard";
                    const v = String(gg.selectedClue?.value ?? "");
                    const q = String(gg.selectedClue?.question ?? "").trim();
                    const clueKey = `${boardKey}:${v}:${q}`;

                    gg.phase = "ANSWER_CAPTURE";
                    gg.answeringPlayerKey = winner.playerName;
                    gg.answerClueKey = clueKey;
                    gg.answerSessionId = `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
                    gg.answerTranscript = null;
                    gg.answerVerdict = null;
                    gg.answerConfidence = null;

                    ctx.clearAnswerWindow(gg);

                    const deadlineAt = Date.now() + RECORD_MS;

                    buzzLog(gameId, "answer-capture-start", {
                        winner: winner.playerName,
                        answerSeconds: ANSWER_SECONDS,
                        recordMs: RECORD_MS,
                        deadlineAt,
                        answerSessionId: gg.answerSessionId,
                        clueKey,
                        now: Date.now(),
                    });

                    ctx.broadcast(gameId, {
                        type: "answer-capture-start",
                        gameId,
                        playerName: winner.playerName,
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
                        if (ggg.answeringPlayerKey !== winner.playerName) return;
                        if (!ggg.selectedClue) return;

                        buzzLog(gameId, "answer-window-timeout", {
                            winner: winner.playerName,
                            answerSessionId: ggg.answerSessionId,
                            clueKey: ggg.answerClueKey,
                            now: Date.now(),
                        });

                        ggg.phase = "RESULT";
                        ggg.answerTranscript = "";
                        ggg.answerVerdict = "incorrect";
                        ggg.answerConfidence = 0.0;

                        const clueValue = ctx.parseClueValue(ggg.selectedClue?.value);

                        ctx.broadcast(gameId, {
                            type: "answer-result",
                            gameId,
                            answerSessionId: ggg.answerSessionId,
                            playerName: winner.playerName,
                            transcript: "",
                            verdict: "incorrect",
                            confidence: 0.0,
                            suggestedDelta: -clueValue,
                        });

                        ctx.autoResolveAfterJudgement(ctx, gameId, ggg, winner.playerName, "incorrect")
                            .catch((e) => console.error("[answer-timeout] autoResolve failed:", e));
                    });
                }, startCaptureAfterMs);
            }, COLLECT_MS);
        }

        // Add candidate to pending list (dedupe optional)
        const clientSeq = Number(data?.clientSeq || 0);

        // Optional dedupe: avoid multiple from same player
        const already = game.pendingBuzz.candidates.find((c) => c.playerName === player.name);
        if (!already) {
            const deadline = game.pendingBuzz.deadline;

            buzzLog(gameId, "candidate-add", {
                msgSeq,
                playerName: player.name,
                clientSeq,
                est,
                arrival: now,
                deadline,
                timeLeftMs: deadline - now,
                deltaArrivalMinusEstMs: now - est,
                looksLikeEpochMs,
            });

            game.pendingBuzz.candidates.push({
                playerName: player.name,
                est,
                arrival: now,
                clientSeq,
                msgSeq,
            });
        } else {
            buzzLog(gameId, "candidate-skip-duplicate", {
                msgSeq,
                playerName: player.name,
                clientSeq,
                existing: {
                    playerName: already.playerName,
                    est: already.est,
                    arrival: already.arrival,
                    msgSeq: already.msgSeq,
                    clientSeq: already.clientSeq,
                },
                now,
            });
        }
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
            const stt = await ctx.transcribeAnswerAudio( buf, mimeType, game.selectedClue?.answer );
            transcript = String(stt || "").trim();
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
                return ctx.autoResolveAfterJudgement(ctx, gameId, game, player.name, "incorrect")
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
            return ctx.autoResolveAfterJudgement(ctx, gameId, game, player.name, "incorrect")
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
        let verdict;

        try {
            const expectedAnswer = String(game.selectedClue?.answer || "");
            verdict = await ctx.judgeClueAnswerFast(expectedAnswer, transcript );

        } catch (e) {
            console.error("[answer-audio-blob] judge failed:", e?.message || e);
            verdict = "incorrect";
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

        ctx.broadcast(gameId, {
            type: "answer-result",
            gameId,
            answerSessionId,
            playerName: player.name,
            transcript,
            verdict,
            suggestedDelta,
        });

        if (verdict === "correct" || verdict === "incorrect") {
            return await ctx.autoResolveAfterJudgement(ctx, gameId, game, player.name, verdict);
        }

        return ctx.autoResolveAfterJudgement(ctx, gameId, game, player.name, "incorrect")
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
        const game = ctx.games[gameId];
        if (!game) return;

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

        if (callerStable !== game.selectorKey) {
            console.warn("[CLUE SELECT BLOCKED] not selector");
            return;
        }

        // Any previous clue’s scheduled unlock should be canceled
        ctx.cancelAutoUnlock(game);

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

        game.phase = "clue";
        game.clueState = {
            clueKey,
            lockedOut: {},
        };

        // Reset buzzer state
        game.buzzed = null;
        game.buzzerLocked = true;
        game.buzzLockouts = {};

        const pad = 100;
        const ttsAssetId = game.boardData?.ttsByClueKey?.[clueKey] || null;

        const broadcastClueSelected = () => {
            ctx.broadcast(gameId, { type: "buzzer-ui-reset" });
            ctx.broadcast(gameId, { type: "buzzer-locked" });
            ctx.broadcast(gameId, {
                type: "clue-selected",
                clue: game.selectedClue,
                clearedClues: Array.from(game.clearedClues),
            });

        }

        await ctx.aiHostVoiceSequence(ctx, gameId, game, [
            {slot: game.selectedClue.category, pad},
            {slot: game.selectedClue.value, pad: 50, after: broadcastClueSelected},
            {assetId: ttsAssetId},

        ]);

        doUnlockBuzzerAuthoritative( gameId, game, ctx);
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

        const trace = ctx.createTrace("tts-ensure", { gameId });

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

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

        if (game.timeToAnswer !== -1) {
            ctx.startGameTimer(gameId, game, ctx.broadcast, game.timeToAnswer, "answer");
        }
    },

    "unlock-buzzer": async ({ ws, data, ctx }) => {
        const { gameId } = data;
        const game = ctx.games[gameId];
        if (!game) return;
        if (!ctx.requireHost(game, ws)) return;

        game.buzzerLocked = false;
        ctx.broadcast(gameId, { type: "buzzer-unlocked" });

        if (game.timeToBuzz !== -1) {
            ctx.startGameTimer(
                gameId,
                game,
                ctx.broadcast,
                game.timeToBuzz,
                "buzz",
                ({ gameId, game }) => {
                    if (!game.buzzerLocked && !game.buzzed) {
                        game.buzzerLocked = true;
                        ctx.broadcast(gameId, { type: "buzzer-locked" });
                        ctx.broadcast(gameId, { type: "answer-revealed" });
                    }
                }
            );
        }
    },

    "lock-buzzer": async ({ ws, data, ctx }) => {
        const {gameId} = data;
        if (!ctx.requireHost(ctx.games[gameId], ws)) return;

        if (ctx.games[gameId]) {
            ctx.games[gameId].buzzerLocked = true; // Lock the buzzer
            ctx.broadcast(gameId, {type: 'buzzer-locked'}); // Notify all players
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

        ctx.broadcast(gameId, { type: "reset-buzzer" });
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
        const {gameId, clue} = data;
        if (!ctx.requireHost(ctx.games[gameId], ws)) return;

        if (ctx.games[gameId]) {
            ctx.games[gameId].selectedClue = {
                ...clue,
                isAnswerRevealed: false, // Add if the answer is revealed or not
            };

            // Reset buzzer state
            ctx.games[gameId].buzzed = null;
            ctx.games[gameId].buzzerLocked = true;
            ctx.games[gameId].buzzLockouts = {};
            // Broadcast the selected clue to all players in the game
            ctx.broadcast(gameId, {
                type: "clue-selected",
                clue: ctx.games[gameId].selectedClue, // Send the clue and answer reveal status
                clearedClues: Array.from(ctx.games[gameId].clearedClues),
            });

            ctx.broadcast(gameId, {type: "reset-buzzer"});
            ctx.broadcast(gameId, {type: "buzzer-locked"});
        } else {
            console.error(`[Server] Game ID ${gameId} not found when selecting clue.`);
        }
    },
    "reveal-answer": async ({ ws, data, ctx }) => {
        const {gameId} = data;

        if (ctx.games[gameId] && ctx.games[gameId].selectedClue) {
            // Update the clue's state to mark the answer as revealed
            ctx.games[gameId].selectedClue.isAnswerRevealed = true;

            // Notify all players to display the answer
            ctx.broadcast(gameId, {
                type: "answer-revealed",
                clue: ctx.games[gameId].selectedClue,
            });
        } else {
            console.error(`[Server] Game ID ${gameId} not found or no clue selected when revealing answer.`);
        }
    },
    "return-to-board": async ({ data, ctx }) => {
        const { gameId } = data;
        const game = ctx.games[gameId];
        if (!game) return;

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

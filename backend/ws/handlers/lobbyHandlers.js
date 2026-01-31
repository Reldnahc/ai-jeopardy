export const lobbyHandlers = {
    "create-game": async ({ ws, data, ctx }) => {
        const { gameId } = data ?? {};

        // Use server-authoritative host name for trace context (no client spoofing)
        const serverHost = gameId && ctx.games?.[gameId]?.host ? ctx.games[gameId].host : undefined;
        const trace = ctx.createTrace("create-game", { gameId, host: serverHost });
        trace.mark("ws_received", { type: "create-game" });

        const game = ctx.getGameOrFail({ ws, ctx, gameId });
        if (!game) return;

        // Host-only (prevents spoofing)
        if (!ctx.ensureHostOrFail({ ws, ctx, gameId, game })) return;

        const s = ctx.ensureLobbySettings(game);

        const host = game.host;
        const categories = game.categories;
        const role = ctx.normalizeRole(ws);

        const selectedModel = s.selectedModel;
        const modelInfo = ctx.resolveModelOrFail({ ws, ctx, gameId, game, selectedModel, role });
        if (!modelInfo) return;

        const timeToBuzz = s.timeToBuzz;
        const timeToAnswer = s.timeToAnswer;
        const reasoningEffort = s.reasoningEffort;

        const boardJson = typeof s.boardJson === "string" ? s.boardJson : "";
        const visualMode = s.visualMode;

        const {
            usingImportedBoard,
            effectiveIncludeVisuals,
            requestedProvider,
            canUseBrave,
            effectiveImageProvider,
        } = ctx.resolveVisualPolicy({ role, boardJson, visualMode });

        trace.mark("visual_settings", {
            usingImportedBoard,
            includeVisuals: effectiveIncludeVisuals,
            requestedProvider,
            effectiveImageProvider,
            canUseBrave,
            visualMode,
        });

        if (!game.inLobby) {
            ws.send(JSON.stringify({ type: "error", message: "Game has already started." }));
            return;
        }

        ctx. resetGenerationProgressAndNotify({ ctx, gameId, game });

        const boardData = await ctx.getBoardDataOrFail({
            ctx,
            game,
            gameId,
            categories,
            selectedModel,
            host,
            boardJson,
            effectiveIncludeVisuals,
            effectiveImageProvider,
            reasoningEffort,
            trace,
        });

        // game might have been deleted / board failed
        if (!ctx.games?.[gameId] || !boardData) {
            ctx.broadcast(gameId, {
                type: "create-board-failed",
                message: "Board data was empty.",
            });
            ctx.safeAbortGeneration(game);
            return;
        }

        // If lobby flipped during generation, just abort cleanly
        if (!game.inLobby) {
            ctx.safeAbortGeneration(game);
            return;
        }

        ctx.applyNewGameState({ game, boardData, timeToBuzz, timeToAnswer });

        // --- AI authority bootstrapping (selector + welcome audio) ---
        // Pick a starting selector (random online player; fallback to first player)
        const online = (game.players ?? []).filter((p) => p?.online !== false);
        const pool = online.length > 0 ? online : (game.players ?? []);
        const pick = pool.length > 0
            ? pool[Math.floor(Math.random() * pool.length)]
            : null;

        if (pick) {
            game.selectorKey = pick.playerKey;
            game.selectorName = pick.name;
        } else {
            game.selectorKey = null;
            game.selectorName = null;
        }

        // Prepare welcome TTS so it can be preloaded in the same handshake
        // (If narration is disabled, we still create the asset for now; you can gate later.)
        if (game.selectorName) {
            const welcomeText = `Welcome to AI Jeopardy. ${game.selectorName} will be starting us off today.`;
            try {
                const ensured = await ctx.ensureTtsAsset(
                    { text: welcomeText },
                    ctx.supabase,
                    trace
                );
                game.welcomeTtsAssetId = ensured?.id ?? null;
            } catch (e) {
                console.error("[create-game] welcome TTS failed:", e);
                game.welcomeTtsAssetId = null;
            }
        } else {
            game.welcomeTtsAssetId = null;
        }

        // Phase will be set when preload finishes (in preload-done)
        game.phase = null;
        game.welcomeEndsAt = null;
        if (game.welcomeTimer) {
            clearTimeout(game.welcomeTimer);
            game.welcomeTimer = null;
        }

        trace.mark("broadcast_game_state_start");

        // Preload workflow
        await ctx.setupPreloadHandshake({ ctx, gameId, game, boardData, trace });

        // IMPORTANT: do NOT flip inLobby yet and do NOT broadcast start-game yet.
        // We wait until everyone acks.
        trace.mark("broadcast_game_state_end");
        trace.end({ success: true });
    },

    "preload-done": async ({ ws, data, ctx }) => {
        const { gameId, playerKey, playerName } = data ?? {};
        if (!gameId || !ctx.games?.[gameId]) return;

        const game = ctx.games[gameId];
        if (!game.preload?.active) return;

        // Identify who is asking
        const stable = (typeof playerKey === "string" && playerKey.trim())
            ? playerKey.trim()
            : String(playerName ?? "").trim();

        if (!stable) return;

        // Only accept from players currently in the game list
        const isKnown = (game.players ?? []).some((p) => ctx.playerStableId(p) === stable);
        if (!isKnown) return;

        // Mark done
        if (!game.preload.done.includes(stable)) {
            game.preload.done.push(stable);
        }

        // Recompute who is required (online only)
        const requiredNow = (game.players ?? []).filter((p) => p.online).map(ctx.playerStableId);

        const doneSet = new Set(game.preload.done);
        const allDone = requiredNow.every((id) => doneSet.has(id));

        if (!allDone) return;

        // Phase 2: everyone is ready → start game
        game.preload.active = false;

        // Flip lobby state now
        game.inLobby = false;
        if (!game.lobbyHost) game.lobbyHost = game.host;
        game.host = "AI Jeopardy";

        // Start in welcome phase if we have welcome audio; otherwise go straight to board
        const hasWelcome = typeof game.welcomeTtsAssetId === "string" && game.welcomeTtsAssetId.trim();
        if (game.welcomeTimer) {
            clearTimeout(game.welcomeTimer);
            game.welcomeTimer = null;
        }

        if (hasWelcome) {
            game.phase = "welcome";

            let durationMs = null;
            try {
                durationMs = await ctx.getTtsDurationMs(game.welcomeTtsAssetId);
            } catch (e) {
                console.error("[preload-done] welcome duration lookup failed:", e);
            }

            const waitMs = Math.max(0, (durationMs ?? 0) + 250);
            game.welcomeEndsAt = Date.now() + waitMs;

            game.welcomeTimer = setTimeout(() => {
                const g = ctx.games?.[gameId];
                if (!g) return;
                if (g.phase !== "welcome") return;

                g.phase = "board";
                g.welcomeTimer = null;

                ctx.broadcast(gameId, {
                    type: "phase-changed",
                    phase: "board",
                    selectorKey: g.selectorKey ?? null,
                    selectorName: g.selectorName ?? null,
                });
            }, waitMs);
        } else {
            game.phase = "board";
            game.welcomeEndsAt = null;
        }

        ctx.broadcast(gameId, {
            type: "start-game",
            host: game.host,
        });

    },


    "create-lobby": async ({ ws, data, ctx }) => {
        const { host, categories, playerKey  } = data;

        let newGameId;
        do {
            newGameId = Math.random().toString(36).substr(2, 5).toUpperCase();
        } while (ctx.games[newGameId]);

        ws.gameId = newGameId;

        let color = "bg-blue-500";
        let text_color = "text-white";

        try {
            const c = await ctx.getColorFromPlayerName(host);
            if (c?.color) color = c.color;
            if (c?.text_color) text_color = c.text_color;
        } catch (e) {
            console.error("Color lookup failed:", e);
        }

        const stableKey = typeof playerKey === "string" && playerKey.trim() ? playerKey.trim() : null;

        ctx.games[newGameId] = {
            host,
            players: [{ id: ws.id, name: host, color, text_color, playerKey: stableKey, online: true }],
            inLobby: true,
            createdAt: Date.now(),
            categories: ctx.normalizeCategories11(categories),
            lobbySettings: {
                timeToBuzz: 10,
                timeToAnswer: 10,
                selectedModel: "gpt-5-mini",
                reasoningEffort: "off",
                visualMode: "off", // "off" | "commons" | "brave"
                narrationEnabled: false,
                boardJson: "",
            },
            lockedCategories: {
                firstBoard: Array(5).fill(false),
                secondBoard: Array(5).fill(false),
                finalJeopardy: Array(1).fill(false),
            },
            activeBoard: "firstBoard",
            isFinalJeopardy: false,
            finalJeopardyStage: null,
            emptySince: null,
            cleanupTimer: null,
        };

        ws.send(JSON.stringify({
            type: "lobby-created",
            gameId: newGameId,
            categories: ctx.normalizeCategories11(categories),
            players: [{ id: ws.id, name: host, color, text_color }],
        }));

        ws.send(JSON.stringify(ctx.buildLobbyState(newGameId, ws)));
    },

    "join-lobby": async ({ ws, data, ctx }) => {
        const { gameId, playerName, playerKey } = data;
        if (!ctx.games[gameId]) {
            ws.send(JSON.stringify({ type: "error", message: "Lobby does not exist!" }));
            return;
        }

        const actualName = (playerName ?? "").trim();
        if (!actualName) {
            ws.send(JSON.stringify({ type: "error", message: "Invalid name." }));
            return;
        }

        const game = ctx.games[gameId];
        ctx.cancelLobbyCleanup(game);

        // Prefer stable identity (playerKey) for dedupe/reconnect.
        const stableKey = typeof playerKey === "string" && playerKey.trim() ? playerKey.trim() : null;

        // 1) Reconnect by playerKey when available.
        const existingByKey = stableKey
            ? game.players.find((p) => p.playerKey && p.playerKey === stableKey)
            : null;

        // 2) Fallback: reconnect by name (legacy clients).
        const existingByName = game.players.find((p) => p.name === actualName);

        if (existingByKey) {
            console.log(`[Server] PlayerKey reconnect for ${actualName} -> Lobby ${gameId}`);
            existingByKey.id = ws.id;
            existingByKey.name = actualName; // allow display name changes
            existingByKey.online = true;
            ws.gameId = gameId;
        } else if (existingByName) {
            // RECONNECT: Update the socket ID to the new connection
            console.log(`[Server] Player ${actualName} reconnected to Lobby ${gameId}`);
            existingByName.id = ws.id;
            existingByName.online = true;
            if (stableKey && !existingByName.playerKey) existingByName.playerKey = stableKey;
            ws.gameId = gameId;
        } else {
            // NEW PLAYER: Add them to the list
            const msg = await ctx.getColorFromPlayerName(actualName);
            const raceConditionCheck =
                game.players.find(p => p.name === actualName) ||
                (stableKey ? game.players.find(p => p.playerKey === stableKey) : null);

            if (raceConditionCheck) {
                // Treat it as a reconnect/update instead of a new push
                raceConditionCheck.id = ws.id;
                raceConditionCheck.online = true;
                if (stableKey && !raceConditionCheck.playerKey) raceConditionCheck.playerKey = stableKey;
                ws.gameId = gameId;
            } else {
                // Safe to push new player
                const color = msg?.color || "bg-blue-500";
                const text_color = msg?.text_color || "text-white";

                ctx.cancelLobbyCleanup(game);

                game.players.push({
                    id: ws.id,
                    name: actualName,
                    color,
                    text_color,
                    playerKey: stableKey,
                    online: true,
                });
                ws.gameId = gameId;
                ctx.scheduleLobbyCleanupIfEmpty(gameId); // this will cancel if anyone is online
            }
        }

        // Always send authoritative snapshot (includes "you")
        ws.send(JSON.stringify(ctx.buildLobbyState(gameId, ws)));

        ctx.broadcast(gameId, {
            type: "player-list-update",
            players: game.players.map((p) => ({
                name: p.name,
                color: p.color,
                text_color: p.text_color,
            })),
            host: game.host,
        });
    },

    "leave-lobby": async ({ ws, data, ctx }) => {
        const { gameId, playerId, playerName } = data;
        const name = String(playerId ?? playerName ?? "").trim();

        const effectiveGameId =
            (gameId && ctx.games[gameId] ? gameId : null) ??
            (ws.gameId && ctx.games[ws.gameId] ? ws.gameId : null);

        if (!effectiveGameId || !ctx.games[effectiveGameId] || !name) return;

        const game = ctx.games[effectiveGameId];

        // Only do hard-removal in the lobby
        if (!game.inLobby) return;

        const before = game.players.length;
        game.players = game.players.filter((p) => p.name !== name);

        if (game.players.length === before) return; // nothing to do

        // If host left, reassign host (or delete lobby if empty)
        if (game.host === name) {
            if (game.players.length === 0) {
                ctx.scheduleLobbyCleanupIfEmpty(effectiveGameId);
                return;
            }

            game.host = game.players[0].name;
        }

        ctx.broadcast(effectiveGameId, {
            type: "player-list-update",
            players: game.players.map((p) => ({
                name: p.name,
                color: p.color,
                text_color: p.text_color,
            })),
            host: game.host,
        });

        ctx.scheduleLobbyCleanupIfEmpty(effectiveGameId);
    },

    "update-lobby-settings": async ({ ws, data, ctx }) => {
        try {
            const { gameId, patch } = data ?? {};
            if (!gameId) {
                ws.send(JSON.stringify({ type: "error", message: "update-lobby-settings missing gameId" }));
                return;
            }

            const game = ctx.games?.[gameId];
            if (!game) {
                ws.send(JSON.stringify({ type: "error", message: `Game ${gameId} not found.` }));
                return;
            }

            // Host-only (prevents spoofing)
            if (!ctx.isHostSocket(game, ws)) {
                ws.send(JSON.stringify({ type: "error", message: "Only the host can update lobby settings." }));
                return;
            }

            if (!game.lobbySettings) {
                game.lobbySettings = {
                    timeToBuzz: 10,
                    timeToAnswer: 10,
                    selectedModel: "gpt-5-mini",
                    reasoningEffort: "off",
                    visualMode: "off",
                    narrationEnabled: false,
                    boardJson: "",
                };
            }

            const p = (typeof patch === "object" && patch !== null) ? patch : {};

            // Validate + apply
            if (typeof p.timeToBuzz === "number" && Number.isFinite(p.timeToBuzz)) {
                game.lobbySettings.timeToBuzz = Math.max(1, Math.min(60, Math.floor(p.timeToBuzz)));
            }
            if (typeof p.timeToAnswer === "number" && Number.isFinite(p.timeToAnswer)) {
                game.lobbySettings.timeToAnswer = Math.max(1, Math.min(60, Math.floor(p.timeToAnswer)));
            }

            if (typeof p.selectedModel === "string" && p.selectedModel.trim()) {
                game.lobbySettings.selectedModel = p.selectedModel.trim();
            }

            if (p.reasoningEffort === "off" || p.reasoningEffort === "low" || p.reasoningEffort === "medium" || p.reasoningEffort === "high") {
                game.lobbySettings.reasoningEffort = p.reasoningEffort;
            }

            if (p.visualMode === "off" || p.visualMode === "commons" || p.visualMode === "brave") {
                game.lobbySettings.visualMode = p.visualMode;
            }

            if (typeof p.boardJson === "string") {
                game.lobbySettings.boardJson = p.boardJson;
            }

            if (typeof p.narrationEnabled === "boolean") {
                game.lobbySettings.narrationEnabled = p.narrationEnabled;
            }

            // Broadcast authoritative update to everyone
            ctx.broadcast(gameId, {
                type: "lobby-settings-updated",
                gameId,
                lobbySettings: game.lobbySettings,
            });
        } catch (e) {
            console.error("update-lobby-settings failed:", e);
            ws.send(JSON.stringify({ type: "error", message: "update-lobby-settings failed" }));
        }
    },

    "check-lobby": async ({ ws, data, ctx }) => {
        const {gameId} = data;

        let isValid = false;
        if (ctx.games[gameId] && ctx.games[gameId].inLobby === true) {
            isValid = true;
        }

        ws.send(JSON.stringify({ type: "check-lobby-response", isValid, gameId }));
    },

    "promote-host": async ({ ws, data, ctx }) => {
        const { gameId, targetPlayerName } = data;
        const game = ctx.games[gameId];
        if (!game) return;

        // Only allow in-lobby host promotion
        if (!game.inLobby) return;

        // Only current host socket can promote
        if (!ctx.requireHost(game, ws)) return;

        const target = String(targetPlayerName ?? "").trim();
        if (!target) return;

        const targetPlayer = (game.players || []).find((p) => p.name === target);
        if (!targetPlayer) return;

        // No-op if already host
        if (game.host === target) return;

        game.host = target;

        ctx.broadcast(gameId, {
            type: "player-list-update",
            players: game.players.map((p) => ({
                name: p.name,
                color: p.color,
                text_color: p.text_color,
                online: p?.online !== false,
            })),
            host: game.host,
        });
    },

    "toggle-lock-category": async ({ ws, data, ctx }) => {
        const { gameId, boardType, index } = data;
        const game = ctx.games[gameId];
        if (!game) return;

        if (!ctx.isHostSocket(game, ws)) {
            ws.send(JSON.stringify({ type: "error", message: "Only the host can toggle category locks." }));
            ctx.sendLobbySnapshot(ws, gameId);
            return;
        }

        const bt = boardType;
        if (bt !== "firstBoard" && bt !== "secondBoard" && bt !== "finalJeopardy") return;

        const idx = Number(index);
        if (!Number.isFinite(idx)) return;
        if ((bt === "firstBoard" || bt === "secondBoard") && (idx < 0 || idx > 4)) return;
        if (bt === "finalJeopardy" && idx !== 0) return;

        if (!game.lockedCategories) {
            game.lockedCategories = {
                firstBoard: Array(5).fill(false),
                secondBoard: Array(5).fill(false),
                finalJeopardy: Array(1).fill(false),
            };
        }

        const nextLocked = !Boolean(game.lockedCategories[bt][idx]);
        game.lockedCategories[bt][idx] = nextLocked;

        ctx.broadcast(gameId, { type: "category-lock-updated", boardType: bt, index: idx, locked: nextLocked });
    },

    "randomize-category": async ({ ws, data, ctx }) => {
        const { gameId, boardType, index, candidates } = data;
        const game = ctx.games[gameId];
        if (!game) return;

        // Anyone may request randomize, but server enforces locks + uniqueness.
        const bt = boardType;
        if (bt !== "firstBoard" && bt !== "secondBoard" && bt !== "finalJeopardy") return;

        const idx = bt === "finalJeopardy" ? 0 : Number(index);
        if (!Number.isFinite(idx)) return;
        if ((bt === "firstBoard" || bt === "secondBoard") && (idx < 0 || idx > 4)) return;

        // Lock enforcement
        if ((bt === "firstBoard" || bt === "secondBoard") && game.lockedCategories?.[bt]?.[idx]) {
            ws.send(JSON.stringify({ type: "error", message: "That category is locked." }));
            ctx.sendLobbySnapshot(ws, gameId);
            return;
        }
        if (bt === "finalJeopardy" && game.lockedCategories?.finalJeopardy?.[0]) {
            ws.send(JSON.stringify({ type: "error", message: "That category is locked." }));
            ctx.sendLobbySnapshot(ws, gameId);
            return;
        }

        game.categories = ctx.normalizeCategories11(game.categories);

        let globalIndex = -1;
        if (bt === "firstBoard") globalIndex = idx;
        else if (bt === "secondBoard") globalIndex = 5 + idx;
        else globalIndex = 10;

        const norm = (s) => String(s ?? "").trim().toLowerCase();
        const used = new Set(
            game.categories
                .map((c, i) => (i === globalIndex ? "" : norm(c)))
                .filter((v) => v.length > 0)
        );

        const list = Array.isArray(candidates) ? candidates : [];
        let chosen = "";

        for (const c of list) {
            const v = norm(c);
            if (!v) continue;
            if (used.has(v)) continue;
            chosen = String(c ?? "").trim();
            break;
        }

        if (!chosen) {
            ws.send(JSON.stringify({ type: "error", message: "No unique random category available." }));
            ctx.sendLobbySnapshot(ws, gameId);
            return;
        }

        game.categories[globalIndex] = chosen;

        ctx.broadcast(gameId, {
            type: "category-updated",
            boardType: bt,
            index: bt === "finalJeopardy" ? 0 : idx,
            value: chosen,
        });
    },

    "update-category": async ({ ws, data, ctx }) => {
        try {
            const { gameId, boardType, index, value } = data ?? {};

            if (!gameId) {
                ws.send(JSON.stringify({ type: "error", message: "update-category missing gameId" }));
                return;
            }

            const game = ctx.games?.[gameId];
            if (!game) {
                ws.send(JSON.stringify({ type: "error", message: `Game ${gameId} not found.` }));
                return;
            }

            const bt = boardType;
            if (bt !== "firstBoard" && bt !== "secondBoard" && bt !== "finalJeopardy") {
                ws.send(JSON.stringify({ type: "error", message: `Invalid boardType: ${String(bt)}` }));
                ctx.sendLobbySnapshot(ws, gameId);
                return;
            }

            const idx = bt === "finalJeopardy" ? 0 : Number(index);
            if (!Number.isFinite(idx)) {
                ws.send(JSON.stringify({ type: "error", message: `Invalid index: ${String(index)}` }));
                ctx.sendLobbySnapshot(ws, gameId);
                return;
            }

            if ((bt === "firstBoard" || bt === "secondBoard") && (idx < 0 || idx > 4)) {
                ws.send(JSON.stringify({ type: "error", message: `Index out of range for ${bt}.` }));
                ctx.sendLobbySnapshot(ws, gameId);
                return;
            }

            // Enforce lock server-side
            if ((bt === "firstBoard" || bt === "secondBoard") && game.lockedCategories?.[bt]?.[idx]) {
                ws.send(JSON.stringify({ type: "error", message: "That category is locked." }));
                ctx.sendLobbySnapshot(ws, gameId);
                return;
            }
            if (bt === "finalJeopardy" && game.lockedCategories?.finalJeopardy?.[0]) {
                ws.send(JSON.stringify({ type: "error", message: "That category is locked." }));
                ctx.sendLobbySnapshot(ws, gameId);
                return;
            }

            // Map boardType/index -> global index in the flat 11 array
            const globalIndex =
                bt === "firstBoard" ? idx :
                    bt === "secondBoard" ? 5 + idx :
                        10;

            if (!Array.isArray(game.categories) || globalIndex < 0 || globalIndex > 10) {
                ws.send(JSON.stringify({ type: "error", message: "Server error: invalid categories state." }));
                ctx.sendLobbySnapshot(ws, gameId);
                return;
            }

            // Keep user intent; only strip leading whitespace
            const nextVal = String(value ?? "").replace(/^\s+/, "");
            game.categories[globalIndex] = nextVal;

            // One short log line (optional)
            console.log("[update-category]", gameId, bt, idx, "->", nextVal.slice(0, 60));

            ctx.broadcast(gameId, {
                type: "category-updated",
                boardType: bt,
                index: bt === "finalJeopardy" ? 0 : idx,
                value: nextVal,
            });
        } catch (err) {
            console.error("[update-category] crash", err);
            ws.send(JSON.stringify({ type: "error", message: "Server error while updating category." }));
        }
    },

    "update-categories": async ({ ws, data, ctx }) => {
        const { gameId, categories } = data;
        const game = ctx.games[gameId];

        if (game) {
            const next = ctx.normalizeCategories11(categories);
            game.categories = next;


            ctx.broadcast(gameId, {
                type: "categories-updated",
                categories: next,
            });

            console.log(`[Server] Categories updated for game ${gameId}:`, next);
        } else {
            ws.send(JSON.stringify({
                type: "error",
                message: `Game ${gameId} not found while updating categories.`,
            }));
        }
    },

    "request-lobby-state": async ({ ws, data, ctx }) => {
        const gameId = data.gameId;
        const snapshot = ctx.buildLobbyState(gameId, ws);
        if (!snapshot) {
            ws.send(JSON.stringify({ type: 'error', message: 'Lobby does not exist!' }));
            return;
        }
        ws.send(JSON.stringify(snapshot));
    },
};

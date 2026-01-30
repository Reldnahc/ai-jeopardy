export const lobbyHandlers = {
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

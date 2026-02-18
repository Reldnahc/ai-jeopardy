function makePreloadTtsBatcher({ ctx, gameId, game, flushMs = 250, maxBatch = 12, trace }) {
    let buf = [];
    let timer = null;

    const flush = () => {
        timer = null;
        if (buf.length === 0) return;

        const batch = buf;
        buf = [];

        // ✅ New protocol (tokened)
        ctx.broadcastPreloadBatch({
            ctx,
            gameId,
            game,
            imageAssetIds: [],
            ttsAssetIds: batch,
            final: false,
            trace,
            reason: "board-tts-partial",
        });
    };

    return {
        push(id) {
            const v = String(id ?? "").trim();
            if (!v) return;

            buf.push(v);

            if (buf.length >= maxBatch) {
                flush();
                return;
            }

            if (!timer) timer = setTimeout(flush, flushMs);
        },
        flush,
    };
}


function collectNarrationTextsFromBoard(boardData) {
    const texts = [];

    const boards = [
        boardData?.firstBoard?.categories ?? [],
        boardData?.secondBoard?.categories ?? [],
        boardData?.finalJeopardy?.categories ?? [],
    ];

    for (const cats of boards) {
        for (const cat of cats) {
            for (const clue of (cat.values ?? [])) {
                const v = typeof clue.value === "number" ? clue.value : null;
                const q = String(clue.question ?? "").trim();
                if (!q) continue;

                const prefix = v ? `For ${v} dollars. ` : "";
                texts.push(`${prefix}${q}`.trim());
            }
        }
    }

    // Dedupe so we don't waste DB lookups
    return Array.from(new Set(texts));
}

// --- NEW ---
// Call once at start of create-game so clients can begin preloading ASAP.
export function initPreloadState({ ctx, gameId, game, trace }) {
    if (!game) return null;

    const onlinePlayers = (game.players ?? []).filter((p) => p.online);

    game.preload = {
        active: true,
        required: onlinePlayers.map(ctx.playerStableId),

        // Token increments per batch. Clients ack token.
        token: 0,
        finalToken: null,

        // playerStableId -> last acked token
        acksByPlayer: {},

        createdAt: Date.now(),
    };

    trace?.mark?.("preload_state_initialized", {
        requiredPlayers: game.preload.required.length,
        requiredPlayerIds: game.preload.required,
    });

    // If nobody is required, skip handshake (avoid deadlock)
    if (game.preload.required.length === 0) {
        trace?.mark?.("preload_no_required_players");
        return game.preload;
    }

    // Optional: tell clients a preload session started (useful to clear old state)
    ctx.broadcast(gameId, { type: "preload-start", token: game.preload.token });

    return game.preload;
}

// --- NEW ---
// Broadcast a batch immediately when it becomes available.
export function broadcastPreloadBatch({
                                          ctx,
                                          gameId,
                                          game,
                                          imageAssetIds = [],
                                          ttsAssetIds = [],
                                          final = false,
                                          trace,
                                          reason,
                                      }) {
    if (!game?.preload?.active) return null;

    const images = Array.isArray(imageAssetIds) ? imageAssetIds.filter(Boolean) : [];
    const tts = Array.isArray(ttsAssetIds) ? ttsAssetIds.filter(Boolean) : [];

    // Advance token for this batch
    game.preload.token = (Number(game.preload.token) || 0) + 1;
    const token = game.preload.token;

    if (final) game.preload.finalToken = token;

    trace?.mark?.("preload_broadcast_batch", {
        token,
        final,
        reason: reason || null,
        batchImages: images.length,
        batchTts: tts.length,
    });

    // New protocol
    ctx.broadcast(gameId, {
        type: "preload-assets",
        token,
        final,
        imageAssetIds: images,
        ttsAssetIds: tts,
    });

    // Back-compat for older clients that still listen for preload-images
    ctx.broadcast(gameId, {
        type: "preload-images",
        assetIds: images,
        ttsAssetIds: tts,
        token,
        final,
    });

    return token;
}

// --- UPDATED ---
// This now just sends the FINAL batch (board images + board tts + ai-host tts union)
export async function setupPreloadHandshake({ ctx, gameId, game, boardData, trace }) {
    trace?.mark?.("preload_handshake_start", {
        gameId,
        narrationEnabled: Boolean(game?.lobbySettings?.narrationEnabled),
    });

    if (!game?.preload?.active) {
        initPreloadState({ ctx, gameId, game, trace });
    }

    const imageAssetIds = ctx.collectImageAssetIdsFromBoard(boardData);

    const baseTts = Array.isArray(boardData?.ttsAssetIds) ? boardData.ttsAssetIds : [];
    const aiHostExtra = Array.isArray(game?.aiHostTts?.allAssetIds) ? game.aiHostTts.allAssetIds : [];
    const ttsAssetIds = Array.from(new Set([...baseTts, ...aiHostExtra]));

    broadcastPreloadBatch({
        ctx,
        gameId,
        game,
        imageAssetIds,
        ttsAssetIds,
        final: true,
        trace,
        reason: "board+aihost-final",
    });

    trace?.mark?.("preload_handshake_end", {
        finalToken: game?.preload?.finalToken ?? null,
        imageAssetCount: imageAssetIds.length,
        ttsAssetCount: ttsAssetIds.length,
    });

    return { imageAssetIds, ttsAssetIds };
}

export function getGameOrFail({ ws, ctx, gameId }) {
    if (!gameId) {
        ws.send(JSON.stringify({ type: "error", message: "create-game missing gameId" }));
        return null;
    }

    const game = ctx.games?.[gameId];
    if (!game) {
        ctx.broadcast(gameId, { type: "create-board-failed", message: "Game not found." });
        return null;
    }

    return game;
}

export function ensureHostOrFail({ ws, ctx, gameId, game }) {
    if (!ctx.isHostSocket(game, ws)) {
        ws.send(JSON.stringify({ type: "error", message: "Only the host can start the game." }));
        ctx.sendLobbySnapshot(ws, gameId);
        return false;
    }
    return true;
}

export function ensureLobbySettings(ctx, game, appConfig) {
    if (game.lobbySettings) return game.lobbySettings;

    game.lobbySettings = {
        timeToBuzz: 10,
        timeToAnswer: 10,
        selectedModel: appConfig.ai.defaultModel,
        reasoningEffort: "off",
        visualMode: "off", // "off" | "commons" | "brave"
        narrationEnabled: false,
        boardJson: "",
        sttProviderName: ctx.appConfig.ai.defaultSttProvider,
    };

    return game.lobbySettings;
}

export function normalizeRole(ws) {
    return String(ws.auth?.role ?? "default").toLowerCase();
}

export function resolveModelOrFail({ ws, ctx, gameId, game, selectedModel, role }) {
    const m = ctx.modelsByValue?.[selectedModel];

    // Unknown model? reject (prevents passing arbitrary provider/model ids)
    if (!m) {
        ws.send(JSON.stringify({ type: "error", message: "Unknown model selected." }));
        ctx.sendLobbySnapshot(ws, gameId);
        return null;
    }

    // Disabled models are never allowed (server authoritative)
    if (m.disabled) {
        ws.send(JSON.stringify({ type: "error", message: "That model is currently disabled." }));
        // Optional: force lobby setting back to a free default
        game.lobbySettings.selectedModel = ctx.appConfig.ai.defaultModel;
        ctx.sendLobbySnapshot(ws, gameId);
        return null;
    }

    const isPaidModel = Number(m.price ?? 0) > 0;

    // If paid, require authed + privileged role
    if (isPaidModel) {
        const allowed = role === "admin" || role === "privileged";

        if (!allowed) {
            ws.send(JSON.stringify({
                type: "error",
                message: "Your account is not allowed to use paid models.",
            }));
            // Optional: force downgrade
            game.lobbySettings.selectedModel = ctx.appConfig.ai.defaultModel;
            ctx.sendLobbySnapshot(ws, gameId);
            return null;
        }
    }

    return m;
}

export function resolveVisualPolicy({ role, boardJson, visualMode }) {
    const usingImportedBoard = Boolean(boardJson && boardJson.trim());

    // Visual policy:
    // - If importing board JSON => visuals always enabled, provider forced to "commons"
    // - Otherwise => visualMode controls includeVisuals + provider
    const effectiveIncludeVisuals = usingImportedBoard ? true : (visualMode !== "off");

    // Provider selection (server authoritative)
    const requestedProvider = visualMode === "brave" ? "brave" : "commons";
    const canUseBrave = role === "admin" || role === "privileged";

    const effectiveImageProvider =
        effectiveIncludeVisuals
            ? (requestedProvider === "brave" && canUseBrave ? "brave" : "commons")
            : undefined;

    return {
        usingImportedBoard,
        effectiveIncludeVisuals,
        requestedProvider,
        canUseBrave,
        effectiveImageProvider,
    };
}

export function resetGenerationProgressAndNotify({ ctx, gameId, game }) {
    ctx.broadcast(gameId, { type: "trigger-loading" });

    game.generationDone = 0;
    game.generationTotal = 0;
    game.generationProgress = 0;

    ctx.broadcast(gameId, {
        type: "generation-progress",
        progress: 0,
        done: 0,
        total: 0,
    });
}

export function clearGenerationProgress(game) {
    game.generationDone = null;
    game.generationTotal = null;
    game.generationProgress = null;
}

export function safeAbortGeneration(game) {
    game.isGenerating = false;
    clearGenerationProgress(game);
}

export function applyNewGameState({ game, boardData, timeToBuzz, timeToAnswer }) {
    game.buzzed = null;
    game.buzzerLocked = true;
    game.buzzLockouts = {};
    game.clearedClues = new Set();
    game.boardData = boardData;
    game.scores = {};
    game.isLoading = true;
    game.timeToBuzz = timeToBuzz;
    game.timeToAnswer = timeToAnswer;
    game.isGenerating = false;
    game.activeBoard = "firstBoard";
    game.isFinalJeopardy = false;
    game.finalJeopardyStage = null;
}

export async function getBoardDataOrFail({
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
                                         }) {
    const usingImportedBoard = Boolean(boardJson && boardJson.trim());
    const ttsBatcher = makePreloadTtsBatcher({ ctx, gameId, game, trace });

    try {
        if (usingImportedBoard) {
            const imported = ctx.parseBoardJson(boardJson);
            const v = ctx.validateImportedBoardData(imported);
            if (!v.ok) {
                ctx.broadcast(gameId, { type: "create-board-failed", message: v.error });
                game.isGenerating = false;
                return null;
            }

            await ctx.ensureBoardNarrationTtsForBoardData({
                ctx,
                game,
                boardData: imported,
                narrationEnabled: Boolean(game?.lobbySettings?.narrationEnabled),
                onTtsReady: (id) => ttsBatcher.push(id),
                trace,
            });

            await ctx.ensureAiHostTtsBank({
                ctx,
                game,
                trace
            });

            const ids = Array.isArray(game?.aiHostTts?.allAssetIds) ? game.aiHostTts.allAssetIds : [];

            ctx.broadcastPreloadBatch({
                ctx,
                gameId,
                game,
                imageAssetIds: [],
                ttsAssetIds: ids,
                final: false,
                trace,
                reason: "ai-host-bank",
            });

            ttsBatcher.flush();
            return imported;
        }

        game.isGenerating = true;
        trace?.mark?.("createBoardData_start");

        const boardData = await ctx.createBoardData(ctx, categories, selectedModel, host, {
            includeVisuals: effectiveIncludeVisuals,
            imageProvider: effectiveImageProvider,
            maxVisualCluesPerCategory: 2,
            narrationEnabled: Boolean(game?.lobbySettings?.narrationEnabled),
            reasoningEffort,
            trace,
            onTtsReady: (id) => ttsBatcher.push(id),
            onProgress: ({ done, total, progress }) => {
                const g = ctx.games?.[gameId];
                if (!g) return;

                g.generationDone = done;
                g.generationTotal = total;
                g.generationProgress = progress;

                ctx.broadcast(gameId, { type: "generation-progress", progress, done, total });
            },
        });

        ttsBatcher.flush();

        trace?.mark?.("createBoardData_end");
        return boardData;
    } catch (e) {
        console.error("[Server] create-game failed:", e);
        ctx.broadcast(gameId, {
            type: "create-board-failed",
            message: "Invalid board JSON or generation failed.",
        });
        safeAbortGeneration(game);
        return null;
    }
}

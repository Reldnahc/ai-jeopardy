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

export function ensureLobbySettings(game) {
    if (game.lobbySettings) return game.lobbySettings;

    game.lobbySettings = {
        timeToBuzz: 10,
        timeToAnswer: 10,
        selectedModel: "gpt-5-mini",
        reasoningEffort: "off",
        visualMode: "off", // "off" | "commons" | "brave"
        narrationEnabled: false,
        boardJson: "",
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
        game.lobbySettings.selectedModel = "gpt-5-mini";
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
            game.lobbySettings.selectedModel = "gpt-5-mini";
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
    game.inLobby = false;
    game.timeToBuzz = timeToBuzz;
    game.timeToAnswer = timeToAnswer;
    game.isGenerating = false;
    game.activeBoard = "firstBoard";
    game.isFinalJeopardy = false;
    game.finalJeopardyStage = null;
}

export async function setupPreloadHandshake({ ctx, gameId, game, boardData, trace }) {
    const assetIds = ctx.collectImageAssetIdsFromBoard(boardData);

    const narrationEnabled = Boolean(game?.lobbySettings?.narrationEnabled);
    let ttsAssetIds = [];

    const collectNarrationTexts = () => {
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

                    // Match your in-game narration style
                    const prefix = v ? `For ${v} dollars. ` : "";
                    texts.push(`${prefix}${q}`.trim());
                }
            }
        }

        // Dedupe texts (extra safe; you already dedupe by sha anyway)
        return Array.from(new Set(texts));
    };

    // Create TTS assets up-front so clients can preload MP3s instantly.
    if (narrationEnabled) {
        const texts = collectNarrationTexts();

        trace?.mark?.("tts_preload_ensure_start", { count: texts.length });

        const CONCURRENCY = 3;
        const out = [];
        let i = 0;

        const worker = async () => {
            while (i < texts.length) {
                const idx = i++;
                const text = texts[idx];

                const a = await ctx.ensureTtsAsset(
                    {
                        text,
                        textType: "text",
                        voiceId: "Matthew",
                        engine: "standard",
                        outputFormat: "mp3",
                    },
                    ctx.supabase,
                    trace
                );

                out.push(a.id);
            }
        };

        const workers = Array.from({ length: Math.min(CONCURRENCY, texts.length) }, () => worker());
        await Promise.all(workers);

        ttsAssetIds = out;

        trace?.mark?.("tts_preload_ensure_end", { count: ttsAssetIds.length });
    }

    // Track preload status server-side (online players only)
    const onlinePlayers = (game.players ?? []).filter((p) => p.online);

    game.preload = {
        active: true,
        required: onlinePlayers.map(ctx.playerStableId),
        done: [],
        createdAt: Date.now(),
    };

    trace?.mark?.("broadcast_preload_images_start", {
        imageCount: assetIds.length,
        ttsCount: ttsAssetIds.length,
    });

    // Backwards-compatible message type; just add ttsAssetIds
    ctx.broadcast(gameId, { type: "preload-images", assetIds, ttsAssetIds });

    trace?.mark?.("broadcast_preload_images_end", {
        imageCount: assetIds.length,
        ttsCount: ttsAssetIds.length,
    });

    if (assetIds.length === 0 && ttsAssetIds.length === 0) {
        ctx.broadcast(gameId, { type: "start-game" });
    }

    return { assetIds, ttsAssetIds };
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

    try {
        if (usingImportedBoard) {
            const imported = ctx.parseBoardJson(boardJson);
            const v = ctx.validateImportedBoardData(imported);
            if (!v.ok) {
                ctx.broadcast(gameId, { type: "create-board-failed", message: v.error });
                game.isGenerating = false;
                return null;
            }
            return imported;
        }

        game.isGenerating = true;
        trace?.mark?.("createBoardData_start");

        const boardData = await ctx.createBoardData(categories, selectedModel, host, {
            includeVisuals: effectiveIncludeVisuals,
            imageProvider: effectiveImageProvider,
            maxVisualCluesPerCategory: 2,
            reasoningEffort,
            trace,

            onProgress: ({ done, total, progress }) => {
                const g = ctx.games?.[gameId];
                if (!g) return;

                g.generationDone = done;
                g.generationTotal = total;
                g.generationProgress = progress;

                ctx.broadcast(gameId, { type: "generation-progress", progress, done, total });
            },
        });

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

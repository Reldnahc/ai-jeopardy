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

// Variety banks (add as many as you want)
const AI_HOST_VARIANTS = {
    correct: [
        "That's correct.",
        "Yes, that's right.",
        "Correct.",
        "You got it.",
    ],
    incorrect: [
        "No, that's not it.",
        "Sorry, that's incorrect.",
        "Incorrect.",
        "Nope. That's not the one.",
        "That’s not correct",
    ],
    rebuzz: [
        "Would anyone else like to answer?",
        "Anyone else?",
        "Other players, buzz in if you know it.",
        "Still open—anyone else want to try?",
    ],
    nobody: [
        "Looks like nobody got it.",
        "No one buzzed in.",
        "Time's up—no one got it.",
        "We didn't get an answer on that one.",
    ],
};

// “Name callout” should feel like Jeopardy: short + punchy.
// You can also do `${name}.` but exclamation usually feels better.
function nameCalloutText(name) {
    return `${name}!`;
}

export async function ensureAiHostTtsBank({ ctx, game, trace }) {
    // This creates:
    // game.aiHostTts = {
    //   slotAssets: { correct: [id...], rebuzz: [id...], nobody: [id...] },
    //   nameAssetsByPlayer: { [playerName]: assetId },
    //   allAssetIds: [ ...everything... ],
    // }
    if (!game) return;
    if (game.aiHostTts && Array.isArray(game.aiHostTts.allAssetIds)) return;

    const narrationEnabled = Boolean(game?.lobbySettings?.narrationEnabled);
    // If narration is off, we can skip generating to save cost.
    // But you said “every play downloads every game” — that implies narration is on.
    // We'll respect narrationEnabled to avoid wasting money when it’s off.
    if (!narrationEnabled) {
        game.aiHostTts = { slotAssets: {}, nameAssetsByPlayer: {}, allAssetIds: [] };
        return;
    }

    const out = {
        slotAssets: { correct: [], incorrect: [], rebuzz: [], nobody: [] },
        nameAssetsByPlayer: {},
        allAssetIds: [],
    };

    trace?.mark?.("tts_ensure_aihost_start");

    // 1) Ensure slot variants (concurrent)
    const slotJobs = [];

    for (const slot of ["correct", "incorrect", "rebuzz", "nobody"]) {
        const variants = AI_HOST_VARIANTS[slot] || [];
        for (const text of variants) {
            slotJobs.push((async () => {
                const asset = await ctx.ensureTtsAsset(
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
                out.slotAssets[slot].push(asset.id);
                out.allAssetIds.push(asset.id);
            })());
        }
    }

    // 2) Ensure player name callouts (concurrent)
    const players = Array.isArray(game.players) ? game.players : [];
    for (const p of players) {
        const name = String(p?.name || "").trim();
        if (!name) continue;

        slotJobs.push((async () => {
            const asset = await ctx.ensureTtsAsset(
                {
                    text: nameCalloutText(name),
                    textType: "text",
                    voiceId: "Matthew",
                    engine: "standard",
                    outputFormat: "mp3",
                },
                ctx.supabase,
                trace
            );
            out.nameAssetsByPlayer[name] = asset.id;
            out.allAssetIds.push(asset.id);
        })());
    }

    await Promise.all(slotJobs);

    // de-dupe
    out.allAssetIds = Array.from(new Set(out.allAssetIds));

    game.aiHostTts = out;

    trace?.mark?.("tts_ensure_aihost_end", {
        total: out.allAssetIds.length,
        correct: out.slotAssets.correct.length,
        rebuzz: out.slotAssets.rebuzz.length,
        nobody: out.slotAssets.nobody.length,
        names: Object.keys(out.nameAssetsByPlayer).length,
    });
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

export async function ensureBoardTtsAssets({ ctx, game, boardData, trace }) {
    const narrationEnabled = Boolean(game?.lobbySettings?.narrationEnabled);
    if (!narrationEnabled) return [];

    const texts = collectNarrationTextsFromBoard(boardData);
    if (texts.length === 0) return [];

    trace?.mark?.("tts_ensure_board_start", { count: texts.length });

    const CONCURRENCY = 6;
    const out = [];
    let i = 0;

    const worker = async () => {
        while (i < texts.length) {
            const idx = i++;
            const text = texts[idx];

            const asset = await ctx.ensureTtsAsset(
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

            out.push(asset.id);
        }
    };

    const workers = Array.from({ length: Math.min(CONCURRENCY, texts.length) }, () => worker());
    await Promise.all(workers);

    trace?.mark?.("tts_ensure_board_end", { count: out.length });

    return out;
}

export async function setupPreloadHandshake({ ctx, gameId, game, boardData, trace }) {
    trace?.mark("preload_handshake_start", {
        gameId,
        narrationEnabled: Boolean(game?.lobbySettings?.narrationEnabled),
    });

    const assetIds = ctx.collectImageAssetIdsFromBoard(boardData);
    trace?.mark("preload_images_collected", {
        imageAssetCount: assetIds.length,
    });

    const baseTts = Array.isArray(boardData?.ttsAssetIds) ? boardData.ttsAssetIds : [];
    const extra = (game?.welcomeTtsAssetId && typeof game.welcomeTtsAssetId === "string")
        ? [game.welcomeTtsAssetId]
        : [];

    const aiHostExtra = Array.isArray(game?.aiHostTts?.allAssetIds)
        ? game.aiHostTts.allAssetIds
        : [];

// de-dupe
    const ttsAssetIds = Array.from(new Set([...baseTts, ...extra, ...aiHostExtra]));



    trace?.mark("preload_tts_collected", {
        ttsAssetCount: ttsAssetIds.length,
        hasTtsField: Array.isArray(boardData?.ttsAssetIds),
    });

    const onlinePlayers = (game.players ?? []).filter((p) => p.online);

    game.preload = {
        active: true,
        required: onlinePlayers.map(ctx.playerStableId),
        done: [],
        createdAt: Date.now(),
    };

    trace?.mark("preload_state_initialized", {
        requiredPlayers: game.preload.required.length,
        requiredPlayerIds: game.preload.required,
    });

    trace?.mark("preload_broadcast_start", {
        imageAssetCount: assetIds.length,
        ttsAssetCount: ttsAssetIds.length,
    });

    ctx.broadcast(gameId, {
        type: "preload-images",
        assetIds,
        ttsAssetIds,
    });

    trace?.mark("preload_broadcast_end");

    if (assetIds.length === 0 && ttsAssetIds.length === 0) {
        trace?.mark("preload_empty_fast_start");
        ctx.broadcast(gameId, { type: "start-game" });
        trace?.mark("preload_empty_fast_end");
    }

    trace?.mark("preload_handshake_end");

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
            narrationEnabled: Boolean(game?.lobbySettings?.narrationEnabled),
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

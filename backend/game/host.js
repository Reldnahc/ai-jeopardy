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
    welcome_intro: [
        "Welcome to AI Jeopardy."
    ],
    welcome_outro: [
        "will be starting us off today.",
        "you're up first.",
    ],
    your_up: [
        "you're up.",
        "go ahead.",
        "pick the next clue.",
    ],
    daily_double: [
        "Daily Double!",
    ],
    daily_double2: [
        "You've found the Daily Double.",
    ],
    single_wager: [
        "What’s your wager?",
    ],
    all_wager: [
        "Make your wagers.",
    ],
    present_clue: [
        "Here’s the clue.",
    ],
    double_jeopardy: [
        "That’s the end of the Jeopardy! round.",
        "That’s the end of the first round.",
    ],
    double_jeopardy2: [
        "Coming up, Double Jeopardy!",
        "Coming next, Double Jeopardy!",
        "Up next, Double Jeopardy!",
    ],
    final_jeopardy: [
        "That’s the end of the Double Jeopardy! round.",
    ],
    final_jeopardy2: [
        "It’s time for Final Jeopardy!",
    ],
    final_jeopardy_category: [
        "Here is the category.",
    ],
    final_jeopardy_clue: [
        "Here is the Final Jeopardy clue.",
    ],
};

// “Name callout” should feel like Jeopardy: short + punchy.
// You can also do `${name}.` but exclamation usually feels better.
function nameCalloutText(name) {
    return `${name}!`;
}

export async function ensureAiHostTtsBank({ ctx, game, trace }) {
    if (!game) return;
    if (game.aiHostTts && Array.isArray(game.aiHostTts.allAssetIds)) return;

    const narrationEnabled = Boolean(game?.lobbySettings?.narrationEnabled);
    if (!narrationEnabled) {
        game.aiHostTts = { slotAssets: {}, nameAssetsByPlayer: {}, allAssetIds: [] };
        return;
    }

    const slotKeys = Object.keys(AI_HOST_VARIANTS);

    const out = {
        slotAssets: {},
        nameAssetsByPlayer: {},
        allAssetIds: [],
        categoryAssetsByCategory: {},
    };

    // init arrays for every slot
    for (const k of slotKeys) out.slotAssets[k] = [];

    trace?.mark?.("tts_ensure_aihost_start");

    const slotJobs = [];

    // 1) Ensure slot variants
    for (const slot of slotKeys) {
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

    // 2) Ensure player name callouts
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

    // 3) Ensure category name callouts
    const categories = Array.isArray(game.categories) ? game.categories : [];
    for (const c of categories) {
        const categoryName =
            typeof c === "string"
                ? c.trim()
                : String(c?.name || c?.category || "").trim();

        if (!categoryName) continue;

        slotJobs.push((async () => {
            const asset = await ctx.ensureTtsAsset(
                {
                    text: categoryName,
                    textType: "text",
                    voiceId: "Matthew",
                    engine: "standard",
                    outputFormat: "mp3",
                },
                ctx.supabase,
                trace
            );

            out.categoryAssetsByCategory[categoryName] = asset.id;
            out.allAssetIds.push(asset.id);
        })());
    }


    await Promise.all(slotJobs);

    out.allAssetIds = Array.from(new Set(out.allAssetIds));
    game.aiHostTts = out;

    trace?.mark?.("tts_ensure_aihost_end", {
        total: out.allAssetIds.length,
        slots: slotKeys.reduce((acc, k) => {
            acc[k] = out.slotAssets[k]?.length ?? 0;
            return acc;
        }, {}),
        names: Object.keys(out.nameAssetsByPlayer).length,
    });
}

function aiHostSayAsset(gameId, assetId, ctx) {
    if (!assetId) return null;
    ctx.broadcast(gameId, { type: "ai-host-say", assetId });
    return assetId;
}

const withTimeout = (p, ms, fallback) => {
    let t = null;
    const timeout = new Promise((resolve) => {
        t = setTimeout(() => resolve(fallback), ms);
    });
    return Promise.race([p, timeout]).finally(() => {
        if (t) clearTimeout(t);
    });
};

export async function aiHostSayRandomFromSlot(gameId, game, slot, ctx) {
    const ids = game?.aiHostTts?.slotAssets?.[slot];
    const assetId = Array.isArray(ids) ? ids[Math.floor(Math.random() * ids.length)] : null;
    if (!assetId) return null;

    // Fire-and-forget: client can start playing immediately
    aiHostSayAsset(gameId, assetId, ctx);

    // Duration is best-effort; NEVER block game flow on Supabase/R2
    const ms = await withTimeout(
        ctx.getTtsDurationMs(assetId),
        1000,     // <= key change: cap how long we wait
        0
    );

    return { assetId, ms: Number(ms) || 0 };
}

export async function aiHostSayPlayerName(gameId, game, playerName, ctx) {
    const id = game?.aiHostTts?.nameAssetsByPlayer?.[playerName] || null;
    if (!id) return null;

    aiHostSayAsset(gameId, id, ctx);

    const ms = await withTimeout(
        ctx.getTtsDurationMs(id),
        1000,
        0
    );

    return { assetId: id, ms: Number(ms) || 0 };
}

export async function aiHostSayCategory(gameId, game, category, ctx) {
    const id = game?.aiHostTts?.categoryAssetsByCategory?.[category] || null;
    if (!id) return null;

    aiHostSayAsset(gameId, id, ctx);

    const ms = await withTimeout(
        ctx.getTtsDurationMs(id),
        1000,
        0
    );

    return { assetId: id, ms: Number(ms) || 0 };
}

export function aiAfter(gameId, delayMs, fn) {
    // Use your existing timer system so it’s centralized.
    // startGameTimer signature in this file: startGameTimer(gameId, game, broadcast, seconds, kind, onExpire?)
    // But we need ms granularity; easiest is setTimeout with safe game lookup:

    setTimeout(() => {
        try { fn(); } catch (e) { console.error("[aiAfter]", e); }
    }, Math.max(0, Number(delayMs || 0)));
}
// aiHostTts.ts
/* eslint-disable @typescript-eslint/no-explicit-any */

// Variety banks (add as many as you want)
const AI_HOST_VARIANTS: Record<string, string[]> = {
    correct: ["That's correct.", "Yes, that's right.", "Correct.", "You got it."],
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
    welcome_intro: ["Welcome to AI Jeopardy."],
    welcome_outro: ["will be starting us off today.", "you're up first."],
    your_up: ["you're up.", "go ahead.", "pick the next clue."],
    daily_double: ["Daily Double!"],
    daily_double2: ["You've found the Daily Double."],
    single_wager: ["What’s your wager?"],
    all_wager: ["Make your wagers."],
    present_clue: ["Here’s the clue."],
    double_jeopardy: ["That’s the end of the Jeopardy round.", "That’s the end of the first round."],
    double_jeopardy2: ["Coming up, Double Jeopardy", "Coming next, Double Jeopardy", "Up next, Double Jeopardy"],
    final_jeopardy: ["That’s the end of the Double Jeopardy round."],
    final_jeopardy2: ["It’s time for Final Jeopardy"],
    final_jeopardy_category: ["Here is the category."],
    final_jeopardy_clue: ["Here is the Final Jeopardy clue."],
};

// “Name callout” should feel like Jeopardy: short + punchy.
function nameCalloutText(name: string): string {
    return `${name}!`;
}

/** ---------- Types (minimal, but useful) ---------- */

export type Trace = {
    mark?: (name: string, data?: any) => void;
};

export type EnsureTtsAssetParams = {
    text: string;
    textType: "text";
    voiceId: string;
    engine: string;
    outputFormat: string;
};

export type TtsAsset = { id: string };

export type AiHostTtsBank = {
    slotAssets: Record<string, string[]>;
    nameAssetsByPlayer: Record<string, string>;
    categoryAssetsByCategory: Record<string, string>;
    allAssetIds: string[];
};

export type Player = { name?: string | null };

export type Category =
    | string
    | {
    name?: string | null;
    category?: string | null;
};

export type Game = {
    lobbySettings?: { narrationEnabled?: boolean | null } | null;
    players?: Player[] | null;
    categories?: Category[] | null;
    aiHostTts?: AiHostTtsBank | null;
};

export type Ctx = {
    pool: any;

    ensureTtsAsset: (
        params: EnsureTtsAssetParams,
        pool: any,
        trace?: Trace
    ) => Promise<TtsAsset>;

    getTtsDurationMs: (assetId: string) => Promise<number>;

    broadcast: (gameId: string, msg: any) => void;
    sleep: (ms: number) => Promise<void>;
};

export type SayResult = { assetId: string; ms: number };

export type VoiceStep = {
    // In your current JS steps use { slot, pad?, after? }
    slot: string;
    pad?: number;
    after?: () => void | Promise<void>;
};

/** ---------- ensure bank ---------- */

export async function ensureAiHostTtsBank(opts: {
    ctx: Ctx;
    game: Game;
    trace?: Trace;
}): Promise<void> {
    const { ctx, game, trace } = opts;

    if (!game) return;
    if (game.aiHostTts && Array.isArray(game.aiHostTts.allAssetIds)) return;

    const narrationEnabled = Boolean(game?.lobbySettings?.narrationEnabled);
    if (!narrationEnabled) {
        game.aiHostTts = {
            slotAssets: {},
            nameAssetsByPlayer: {},
            categoryAssetsByCategory: {},
            allAssetIds: [],
        };
        return;
    }

    const slotKeys = Object.keys(AI_HOST_VARIANTS);

    const out: AiHostTtsBank = {
        slotAssets: {},
        nameAssetsByPlayer: {},
        categoryAssetsByCategory: {},
        allAssetIds: [],
    };

    // init arrays for every slot
    for (const k of slotKeys) out.slotAssets[k] = [];

    trace?.mark?.("tts_ensure_aihost_start");

    const slotJobs: Array<Promise<void>> = [];

    // 1) Ensure slot variants
    for (const slot of slotKeys) {
        const variants = AI_HOST_VARIANTS[slot] || [];
        for (const text of variants) {
            slotJobs.push(
                (async () => {
                    const asset = await ctx.ensureTtsAsset(
                        {
                            text,
                            textType: "text",
                            voiceId: "Matthew",
                            engine: "standard",
                            outputFormat: "mp3",
                        },
                        ctx.pool,
                        trace
                    );

                    out.slotAssets[slot].push(asset.id);
                    out.allAssetIds.push(asset.id);
                })()
            );
        }
    }

    // 2) Ensure player name callouts
    const players = Array.isArray(game.players) ? game.players : [];
    for (const p of players) {
        const name = String(p?.name || "").trim();
        if (!name) continue;

        slotJobs.push(
            (async () => {
                const asset = await ctx.ensureTtsAsset(
                    {
                        text: nameCalloutText(name),
                        textType: "text",
                        voiceId: "Matthew",
                        engine: "standard",
                        outputFormat: "mp3",
                    },
                    ctx.pool,
                    trace
                );

                out.nameAssetsByPlayer[name] = asset.id;
                out.allAssetIds.push(asset.id);
            })()
        );
    }

    // 3) Ensure category name callouts
    const categories = Array.isArray(game.categories) ? game.categories : [];
    for (const c of categories) {
        const categoryName =
            typeof c === "string"
                ? c.trim()
                : String(c?.name || c?.category || "").trim();

        if (!categoryName) continue;

        slotJobs.push(
            (async () => {
                const asset = await ctx.ensureTtsAsset(
                    {
                        text: categoryName,
                        textType: "text",
                        voiceId: "Matthew",
                        engine: "standard",
                        outputFormat: "mp3",
                    },
                    ctx.pool,
                    trace
                );

                out.categoryAssetsByCategory[categoryName] = asset.id;
                out.allAssetIds.push(asset.id);
            })()
        );
    }

    await Promise.all(slotJobs);

    out.allAssetIds = Array.from(new Set(out.allAssetIds));
    game.aiHostTts = out;

    trace?.mark?.("tts_ensure_aihost_end", {
        total: out.allAssetIds.length,
        slots: slotKeys.reduce<Record<string, number>>((acc, k) => {
            acc[k] = out.slotAssets[k]?.length ?? 0;
            return acc;
        }, {}),
        names: Object.keys(out.nameAssetsByPlayer).length,
        categories: Object.keys(out.categoryAssetsByCategory).length,
    });
}

/** ---------- say helpers ---------- */

function aiHostSayAsset(ctx: Ctx, gameId: string, assetId: string | null | undefined): string | null {
    if (!assetId) return null;
    ctx.broadcast(gameId, { type: "ai-host-say", assetId });
    return assetId;
}

const withTimeout = async <T>(p: Promise<T>, ms: number, fallback: T): Promise<T> => {
    let t: ReturnType<typeof setTimeout> | null = null;

    const timeout = new Promise<T>((resolve) => {
        t = setTimeout(() => resolve(fallback), ms);
    });

    try {
        return await Promise.race([p, timeout]);
    } finally {
        if (t) clearTimeout(t);
    }
};

export async function aiHostSayByKey(
    ctx: Ctx,
    gameId: string,
    game: Game,
    key: string
): Promise<SayResult | null> {
    if (!key) return null;

    const tts = game?.aiHostTts;
    if (!tts) return null;

    const resolved: string | string[] | null =
        tts.nameAssetsByPlayer?.[key] ||
        tts.categoryAssetsByCategory?.[key] ||
        tts.slotAssets?.[key] ||
        null;

    if (!resolved) return null;

    const assetId = Array.isArray(resolved)
        ? resolved[Math.floor(Math.random() * resolved.length)]
        : resolved;

    if (!assetId) return null;

    aiHostSayAsset(ctx, gameId, assetId);

    const ms = await withTimeout(ctx.getTtsDurationMs(assetId), 1000, 0);
    return { assetId, ms: Number(ms) || 0 };
}

/** ---------- voice sequences ---------- */
export async function aiHostVoiceSequence(
    ctx: Ctx,
    gameId: string,
    game: Game,
    steps: VoiceStep[]
): Promise<void> {
    for (const step of steps) {

        const said = await aiHostSayByKey(ctx, gameId, game, step.slot);

        const ms = said?.ms ?? 0;
        await ctx.sleep(ms + (step.pad ?? 0));

        if (typeof step.after === "function") {
            await step.after();
        }
    }
}

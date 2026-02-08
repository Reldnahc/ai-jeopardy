// aiHostTts.ts
import type {
    Trace,
    AiHostTtsBank,
    Game,
    Ctx,
    SayResult,
    VoiceStep,
} from "../ws/context.types";

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

function collectBoardValues(game: Game): number[] {
    const valueSet = new Set<number>();

    const boards = [
        game.boardData?.firstBoard?.categories ?? [],
        game.boardData?.secondBoard?.categories ?? [],
    ];

    for (const boardCats of boards) {
        for (const cat of boardCats) {
            for (const clue of cat?.values ?? []) {
                const v = Number(clue?.value);
                if (Number.isFinite(v) && v > 0) valueSet.add(v);
            }
        }
    }

    return Array.from(valueSet).sort((a, b) => a - b);
}

export async function ensureAiHostValueTts(opts: {
    ctx: Ctx;
    game: Game;
    trace?: Trace;
}): Promise<void> {
    const { ctx, game, trace } = opts;

    if (!game) return;

    const narrationEnabled = Boolean(game?.lobbySettings?.narrationEnabled);
    if (!narrationEnabled) return;

    // Make sure bank exists (even if ensureAiHostTtsBank hasn't been called yet)
    if (!game.aiHostTts || !Array.isArray(game.aiHostTts.allAssetIds)) {
        game.aiHostTts = {
            slotAssets: {},
            nameAssetsByPlayer: {},
            categoryAssetsByCategory: {},
            valueAssetsByValue: {},
            allAssetIds: [],
        };
    }

    const tts = game.aiHostTts;

    // If board data isn't ready yet, do nothing (call again later)
    const values = collectBoardValues(game);
    if (values.length === 0) return;

    tts.valueAssetsByValue = tts.valueAssetsByValue || {};

    const jobs: Array<Promise<void>> = [];

    for (const v of values) {
        const k = String(v);

        // already ensured
        if (tts.valueAssetsByValue[k]) continue;

        jobs.push(
            (async () => {
                const asset = await ctx.ensureTtsAsset(
                    {
                        text: `For ${v} dollars.`,
                        textType: "text",
                        voiceId: "amy",
                        engine: "standard",
                        outputFormat: "mp3",
                    },
                    ctx.repos
                );

                tts.valueAssetsByValue[k] = asset.id;
                tts.allAssetIds.push(asset.id);
            })()
        );
    }

    await Promise.all(jobs);

    // keep allAssetIds deduped
    tts.allAssetIds = Array.from(new Set(tts.allAssetIds));

    trace?.mark?.("tts_ensure_aihost_values_end", {
        values: Object.keys(tts.valueAssetsByValue).length,
        total: tts.allAssetIds.length,
    });
}

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
            valueAssetsByValue: {},
            allAssetIds: [],
        };
        return;
    }

    const slotKeys = Object.keys(AI_HOST_VARIANTS);

    const out: AiHostTtsBank = {
        slotAssets: {},
        nameAssetsByPlayer: {},
        categoryAssetsByCategory: {},
        valueAssetsByValue: {},
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
                            voiceId: "amy",
                            engine: "standard",
                            outputFormat: "mp3",
                        },
                        ctx.repos
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
                        voiceId: "amy",
                        engine: "standard",
                        outputFormat: "mp3",
                    },
                    ctx.repos
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
                        voiceId: "amy",
                        engine: "standard",
                        outputFormat: "mp3",
                    },
                    ctx.repos
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

export function aiHostSayAsset(ctx: Ctx, gameId: string, assetId: string | null | undefined): string | null {
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
        tts.valueAssetsByValue?.[key] ||
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

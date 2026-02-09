import { modelsByValue } from "../../../shared/models.js";
import type { BoardData } from "../../../shared/types/board.js";
import { makeLimiter, plannedVisualSlots, populateCategoryVisuals, type VisualSettings } from "./visuals.js";
import {Ctx} from "../../ws/context.types.js";

type TraceLike = { mark: (event: string, meta?: Record<string, unknown>) => void };

type ProgressEvent = { done: number; total: number; progress: number };

export type CreateBoardOptions = Partial<VisualSettings> & {
    reasoningEffort?: "off" | "low" | "medium" | "high";
    narrationEnabled?: boolean;
    onProgress?: (p: ProgressEvent) => void;
    onTtsReady?: (assetId: string) => void;
    trace?: TraceLike;
};

function clamp01(n: number) {
    return Math.max(0, Math.min(1, n));
}

async function saveBoardAsync(ctx: any, host: string, board: any) {
    try {
        const normalizedHost = String(host ?? "").toLowerCase().trim();
        const ownerId = await ctx.repos.profiles.getIdByUsername(normalizedHost);
        if (!ownerId) return;

        await ctx.repos.boards.insertBoard(ownerId, board);
        await ctx.repos.profiles.incrementBoardsGenerated(ownerId);
    } catch (e: any) {
        console.error("[Server][saveBoardAsync] Unhandled exception while saving board", {
            message: e?.message ?? e,
            stack: e?.stack,
        });
    }
}

export async function createBoardData(
    ctx: Ctx,
    categories: string[],
    model: string,
    host: string,
    options: CreateBoardOptions = {}
): Promise<BoardData> {
    const settings: Required<Omit<CreateBoardOptions, "onProgress" | "onTtsReady" | "trace">> &
        Pick<CreateBoardOptions, "onProgress" | "onTtsReady" | "trace"> = {
        includeVisuals: false,
        imageProvider: "commons",
        maxVisualCluesPerCategory: 2,
        maxImageSearchTries: 6,
        commonsThumbWidth: 1600,
        preferPhotos: true,

        reasoningEffort: "off",
        narrationEnabled: false,

        onProgress: undefined,
        onTtsReady: undefined,
        trace: undefined,

        ...options,
    } as any;

    const trace = settings.trace;
    trace?.mark("aiService_enter", { model, includeVisuals: settings.includeVisuals });

    if (!categories || categories.length !== 11) {
        throw new Error("You must provide exactly 11 categories.");
    }

    const [firstCategories, secondCategories, finalCategory] = [
        categories.slice(0, 5),
        categories.slice(5, 10),
        categories[10],
    ];

    const modelDef = (modelsByValue as any)[model];
    if (!modelDef) throw new Error(`Unknown model: ${model}`);

    const total = 11 + (settings.includeVisuals ? plannedVisualSlots(settings) + 1 : 0);
    let done = 0;

    const report = () => {
        const progress = total > 0 ? clamp01(done / total) : 0;
        try {
            settings.onProgress?.({ done, total, progress });
        } catch {
            // ignore
        }
    };

    report();

    const tick = (n = 1) => {
        done += n;
        if (done > total) done = total;
        report();
    };

    const limitVisuals = settings.includeVisuals ? makeLimiter(2) : null;
    const limitTts = settings.narrationEnabled ? makeLimiter(3) : null;

    const ttsPromises: Array<Promise<unknown>> = [];
    const ttsIds = new Set<string>();
    const ttsByClueKey: Record<string, string> = Object.create(null);

    const clueKeyFor = (boardType: string, clue: any) => {
        const v = typeof clue?.value === "number" ? clue.value : null;
        const q = String(clue?.question ?? "").trim();
        if (!q) return null;
        return `${boardType}:${v ?? "?"}:${q}`;
    };

    const enqueueCategoryTts = (boardType: string, json: any) => {
        if (!settings.narrationEnabled || !limitTts) return;

        for (const clue of json?.values ?? []) {
            const q = String(clue?.question ?? "").trim();
            if (!q) continue;

            const p = limitTts(async () => {
                try {
                    const asset = await ctx.ensureTtsAsset(
                        {
                            text: q,
                            textType: "text",
                            voiceId: "amy",
                            engine: "standard",
                            outputFormat: "mp3",
                            provider: "piper",
                        },
                        ctx.repos
                    );

                    ttsIds.add(asset.id);

                    try {
                        settings.onTtsReady?.(asset.id);
                    } catch {
                        // ignore
                    }

                    const k = clueKeyFor(boardType, clue);
                    if (k) ttsByClueKey[k] = asset.id;
                } catch (e: any) {
                    console.error("[TTS] ensureTtsAsset failed:", e?.message ?? e);
                }
            });

            ttsPromises.push(p);
        }
    };

    const valuesFor = (double: boolean) => (double ? [400, 800, 1200, 1600, 2000] : [200, 400, 600, 800, 1000]);

    const categoryPrompt = (category: string, double = false) => {
        const values = valuesFor(double);

        const visualRules = settings.includeVisuals
            ? `
VISUAL CLUES (optional):
- Make up to ${settings.maxVisualCluesPerCategory} of the 5 clues visual.
- It is okay and recommended to choose none.
- ONLY choose subjects who are easy to find an exact picture of examples include (famous people, famous places, everyday object).
- Visual clues should still include a text clue. It should reference the image, but the clue should be solvable without the image.
- If a clue is visual, add:
  "visual": { "commonsSearchQueries": ["...", "..."] }
- No URLs.`
            : "";

        const reasoningRules =
            settings.reasoningEffort !== "off"
                ? `
VERIFICATION STEP:
- Once you are finished fact check each of the questions.
- Make sure that each clue and answer has proper punctuation.
- Every answer needs to end with a ?.
- Replace anything that is not upto standard or breaks the JSON format.
- If you replace anything, fact check again.`
                : "";

        const outputSchema = settings.includeVisuals
            ? `
OUTPUT: Return ONLY valid JSON in this exact shape:
{"category":"Category Name","values":[
  {"value":${values[0]},"question":"Clue text","answer":"Correct response phrased as a question?","visual":{"commonsSearchQueries":["query 1","query 2"]}},
  {"value":${values[1]},"question":"...","answer":"...?"},
  {"value":${values[2]},"question":"...","answer":"...?"},
  {"value":${values[3]},"question":"...","answer":"...?"},
  {"value":${values[4]},"question":"...","answer":"...?"}
]}`
            : `
OUTPUT: Return ONLY valid JSON in this exact shape:
{"category":"Category Name","values":[
  {"value":${values[0]},"question":"Clue text","answer":"Correct response phrased as a question?"},
  {"value":${values[1]},"question":"...","answer":"...?"},
  {"value":${values[2]},"question":"...","answer":"...?"},
  {"value":${values[3]},"question":"...","answer":"...?"},
  {"value":${values[4]},"question":"...","answer":"...?"}
]}`;

        return `
You are a professional Jeopardy clue writer.
Write ONE complete Jeopardy category: "${category}"

RULES:
- Exactly 5 clues with values ${double ? "400, 800, 1200, 1600, 2000" : "200, 400, 600, 800, 1000"}.
- Difficulty strictly increases with value.
- Clues are factual and unambiguous.
- Do NOT include the category title verbatim in any clue or answer.
- Do NOT include the answer in the clue.
- Clues are statements (no question marks).
- Answers are phrased as questions and end with a ?.
- No repeated facts/answers/phrasing.

${visualRules}

${outputSchema}

STRICT:
- Exactly 5 values.
- Values must be exactly ${JSON.stringify(values)} in ascending order.
- No markdown. No extra text. Valid JSON only.

${reasoningRules}
    `.trim();
    };

    const finalPrompt = (category: string) => `
You are a professional Jeopardy clue writer.

Create a SINGLE Final Jeopardy clue for category: "${category}"

RULES:
- Exactly ONE clue and ONE response.
- Very difficult.
- Factual, unambiguous, verifiable.
- Do NOT include the category title verbatim in clue/answer.
- Clue is a statement (no question mark).
- Answer is a question and ends with a ?.

OUTPUT ONLY valid JSON in this exact shape:

{
  "category": "Category Name",
  "values": [
    { "question": "Clue text", "answer": "Correct response phrased as a question?" }
  ]
}

STRICT:
- Exactly 1 value.
- No markdown. No extra text.
  `.trim();

    const timed = async <T>(label: string, fn: () => Promise<T>) => {
        const start = Date.now();
        trace?.mark(`${label} START`);
        try {
            const out = await fn();
            trace?.mark(`${label} END (+${Date.now() - start}ms)`);
            return out;
        } catch (e) {
            trace?.mark(`${label} FAIL (+${Date.now() - start}ms)`);
            throw e;
        }
    };

    const stampCategoryOnClues = (categoryJson: any) => {
        const cat = String(categoryJson?.category || "").trim();
        if (!cat || !Array.isArray(categoryJson?.values)) return categoryJson;

        categoryJson.values = categoryJson.values.map((clue: any) => ({
            ...clue,
            category: cat,
        }));

        return categoryJson;
    };

    const { callOpenAiJson, parseOpenAiJson } = await import("./openaiClient.js");

    trace?.mark("createBoardData BEGIN");

    try {
        const firstCategoryPromises = firstCategories.map((cat, i) =>
            timed(`SINGLE C${i + 1} (${cat})`, async () => {
                const r = await callOpenAiJson(model, categoryPrompt(cat, false), {
                    reasoningEffort: settings.reasoningEffort,
                });
                const json = parseOpenAiJson<any>(r);

                if (!json || typeof json.category !== "string" || !Array.isArray(json.values)) {
                    throw new Error(`Single category ${i} missing {category, values}`);
                }
                return stampCategoryOnClues(json);
            }).then(async (json) => {
                tick(1);

                enqueueCategoryTts("firstBoard", json);

                if (settings.includeVisuals && limitVisuals) {
                    await limitVisuals(() => populateCategoryVisuals(ctx, json, settings as any, (n) => tick(n)));
                }

                return json;
            })
        );

        const secondCategoryPromises = secondCategories.map((cat, i) =>
            timed(`DOUBLE C${i + 1} (${cat})`, async () => {
                const r = await callOpenAiJson(model, categoryPrompt(cat, true), {
                    reasoningEffort: settings.reasoningEffort,
                });
                const json = parseOpenAiJson<any>(r);

                if (!json || typeof json.category !== "string" || !Array.isArray(json.values)) {
                    throw new Error(`Double category ${i} missing {category, values}`);
                }
                return stampCategoryOnClues(json);
            }).then(async (json) => {
                tick(1);

                enqueueCategoryTts("secondBoard", json);

                if (settings.includeVisuals && limitVisuals) {
                    await limitVisuals(() => populateCategoryVisuals(ctx, json, settings as any, (n) => tick(n)));
                }

                return json;
            })
        );

        const finalPromise = timed(`FINAL (${finalCategory})`, async () => {
            const r = await callOpenAiJson(model, finalPrompt(finalCategory), {
                reasoningEffort: settings.reasoningEffort,
            });
            const json = parseOpenAiJson<any>(r);

            if (!json || typeof json.category !== "string" || !Array.isArray(json.values)) {
                throw new Error("Final jeopardy missing {category, values}");
            }

            return stampCategoryOnClues(json);
        }).then(async (json) => {
            tick(1);

            enqueueCategoryTts("finalJeopardy", json);

            if (settings.includeVisuals && limitVisuals) {
                await limitVisuals(() => populateCategoryVisuals(ctx, json, settings as any, (n) => tick(n)));
            }

            return json;
        });

        const [firstCategoryResults, secondCategoryResults, finalBuilt] = await timed("AWAIT ALL RESULTS", async () =>
            Promise.all([Promise.all(firstCategoryPromises), Promise.all(secondCategoryPromises), finalPromise])
        );

        if (settings.narrationEnabled && ttsPromises.length > 0) {
            await timed("AWAIT ALL TTS", async () => Promise.all(ttsPromises));
        }

        const firstBoard = { categories: firstCategoryResults };
        const secondBoard = { categories: secondCategoryResults };
        const finalJeopardy = { categories: [finalBuilt] };

        const boardRow = { host, model, firstBoard, secondBoard, finalJeopardy };

        if (settings.includeVisuals) tick(1);

        void saveBoardAsync(ctx, host, boardRow);

        return {
            firstBoard,
            secondBoard,
            finalJeopardy,
            ttsAssetIds: Array.from(ttsIds),
            ttsByClueKey,
        };
    } catch (error: any) {
        trace?.mark("createBoardData ERROR");
        console.error("[Server] Error generating board data:", error?.message ?? error);
        throw error;
    }
}

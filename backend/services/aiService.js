import OpenAI from "openai";
import Anthropic from "@anthropic-ai/sdk";
import 'dotenv/config';
import {supabase} from "../config/database.js";
import { modelsByValue } from "../../shared/models.js";
import { pickCommonsImageForQueries } from "./commonsService.js";
import { pickBraveImageForQueries } from "./braveImageService.js";
import { ingestImageToR2FromUrl } from "./imageAssetService.js";
import { ensureTtsAsset } from "./ttsAssetService.js";

// Initialize AI clients
const openai = new OpenAI();
const anthropic = new Anthropic();
const deepseek = new OpenAI({
    baseURL: 'https://api.deepseek.com',
    apiKey: process.env.DEEPSEEK_API_KEY
});

const providerApiMap = {
    openai: callOpenAi,
    deepseek: callDeepseek,
    anthropic: callAnthropic,
};

function clamp01(n) {
    return Math.max(0, Math.min(1, n));
}

function plannedVisualSlots(settings) {
    if (!settings.includeVisuals) return 0;
    const maxPerCat = Number(settings.maxVisualCluesPerCategory ?? 0);
    if (!Number.isFinite(maxPerCat) || maxPerCat <= 0) return 0;
    return 10 * maxPerCat; // 5 + 5 categories
}

function callOpenAi(model, prompt, options = {}) {
    const modelDef = modelsByValue[model];
    const effort = options?.reasoningEffort;

    const includeReasoningEffort =
        modelDef?.supportsReasoningEffort === true &&
        (effort === "low" || effort === "medium" || effort === "high");

    const payload = {
        model,
        messages: [{ role: "user", content: prompt }],
        response_format: { type: "json_object" },
    };

    if (includeReasoningEffort) {
        payload.reasoning_effort = effort;
    }

    return openai.chat.completions.create(payload);
}

function callDeepseek(model, prompt, options = {}) {
    return deepseek.chat.completions.create({
        model,
        messages: [{ role: "user", content: prompt }],
    });
}

function callAnthropic(model, prompt, options = {}) {
    return anthropic.messages.create({
        model,
        system: "Respond only with valid JSON as described. Do not include any other text.",
        max_tokens: 2000,
        messages: [
            {
                role: "user",
                content: [{ type: "text", text: prompt }],
            },
        ],
    });
}


async function createCategoryOfTheDay() {
    console.log("Creating new Category of the day.");
    const prompt = `
        Create a category of the day.
        create a description for the category.
        the description should be a short single sentence description of the category.
        it should be worded in a fun expressive and brief way.
        Format the response in JSON as:
        {
            "category": "Category Name",
            "description": "description",
        }
    `;
    const response = await callOpenAi("gpt-4o-mini", prompt, {});
    let data;
    if (response.choices && response.choices[0]) {
        data = JSON.parse(response.choices[0].message.content.replace(/```(?:json)?/g, "").trim());
    }
    console.log(data);
    return data;
}

function cleanJsonText(s) {
    return String(s ?? "").replace(/```(?:json)?/g, "").trim();
}

function parseProviderJson(response) {
    // Anthropic shape: { content: [{ text: "..." }] }
    if (response?.content?.[0]?.text) {
        return JSON.parse(cleanJsonText(response.content[0].text));
    }
    // OpenAI/DeepSeek chat.completions shape: { choices: [{ message: { content: "..." } }] }
    if (response?.choices?.[0]?.message?.content) {
        return JSON.parse(cleanJsonText(response.choices[0].message.content));
    }
    throw new Error("Unknown AI response shape (cannot parse JSON).");
}

const saveBoardAsync = async ({ supabase, host, board }) => {
    try {
        const profileRes = await supabase
            .from("profiles")
            .select("id")
            .eq("username", host.toLowerCase())
            .single();

        const ownerId = profileRes.data?.id;
        if (!ownerId) {
            console.log("[Server] Board not saved: profile missing id");
            return;
        }

        const { error } = await supabase
            .from("jeopardy_boards")
            .insert([{ board, owner: ownerId }]);

        if (error) console.log("[Server] Error saving board:", error);
        else console.log("[Server] Board saved successfully");
    } catch (e) {
        console.log("[Server] Error saving board (async):", e?.message ?? e);
    }
};

function stripVisualWording(question) {
    return String(question ?? "")
        .replace(/\b(shown|pictured)\s+here\b/gi, "")
        .replace(/\b(in\s+the\s+image|in\s+this\s+(photo|picture))\b/gi, "")
        .replace(/\s{2,}/g, " ")
        .trim();
}

function makeLimiter(maxConcurrent) {
    let active = 0;
    const queue = [];

    const runNext = () => {
        if (active >= maxConcurrent) return;
        const next = queue.shift();
        if (!next) return;
        active += 1;
        next().finally(() => {
            active -= 1;
            runNext();
        });
    };

    return (fn) =>
        new Promise((resolve, reject) => {
            queue.push(() => fn().then(resolve, reject));
            runNext();
        });
}

async function populateCategoryVisuals(cat, settings, progressTick) {
    if (!settings.includeVisuals) return;

    // Image provider is intentionally swappable: use either Commons OR Brave.
    // (Not both in one run—keep it deterministic and avoid extra cost.)
    const imageProvider = String(settings.imageProvider ?? "commons").toLowerCase();
    const pickImageForQueries = imageProvider === "brave"
        ? pickBraveImageForQueries
        : pickCommonsImageForQueries;

    const maxPerCategory = Number(settings.maxVisualCluesPerCategory ?? 0);
    const values = Array.isArray(cat?.values) ? cat.values : [];

    // We only attempt image finding for clues that have a visual spec.
    const visualClues = values
        .filter((c) => c?.visual?.commonsSearchQueries?.length)
        .slice(0, maxPerCategory);

    let attemptedSlots = 0;

    for (const clue of visualClues) {
        attemptedSlots += 1;
        try {
            const found = await pickImageForQueries(
                clue.visual.commonsSearchQueries,
                {
                    maxQueries: settings.maxImageSearchTries,
                    searchLimit: 5,
                    preferPhotos: settings.preferPhotos,
                    trace: settings.trace,
                }
            );

            if (!found) {
                clue.question = stripVisualWording(clue.question);
                delete clue.visual;
                continue;
            }

            // "Caching" here is ingesting to R2 (dedupe + upload + DB)
            const assetId = await ingestImageToR2FromUrl(
                found.downloadUrl,
                {
                    sourceUrl: found.sourceUrl,
                    license: found.license,
                    licenseUrl: found.licenseUrl,
                    attribution: found.attribution,
                    trace: settings.trace,
                },
                supabase
            );

            clue.media = { type: "image", assetId };
            delete clue.visual;
        } catch (e) {
            // Fail-soft: keep clue as text
            clue.question = stripVisualWording(clue.question);
            delete clue.visual;
        } finally {
            if (typeof progressTick === "function") progressTick(1);
        }
    }

    // Count the remainder as "skipped slots" so the bar doesn't stall.
    const remainingSlots = Math.max(0, maxPerCategory - attemptedSlots);
    if (remainingSlots > 0 && typeof progressTick === "function") {
        progressTick(remainingSlots);
    }

    // Cleanup any remaining visual specs if they exceed maxVisualCluesPerCategory
    for (const clue of values) {
        if (clue?.visual) delete clue.visual;
    }
}

// Kept for compatibility / tests: enriches an entire board (sequentially).
async function populateBoardVisuals(board, settings, progressTick) {
    if (!settings.includeVisuals) return;

    const rounds = [
        board?.firstBoard?.categories,
        board?.secondBoard?.categories,
    ].filter(Array.isArray);

    for (const categories of rounds) {
        for (const cat of categories) {
            await populateCategoryVisuals(cat, settings, progressTick);
        }
    }

    // At this point, all ingestion to R2 is complete for this run.
    if (typeof progressTick === "function") progressTick(1);
}



async function createBoardData(categories, model, host, options = {}) {
    const settings = {
        includeVisuals: false,
        // Choose where visual clue images come from: "commons" or "brave".
        // (For now, pick ONE; we do not combine sources.)
        imageProvider: "commons",
        maxVisualCluesPerCategory: 2,
        maxImageSearchTries: 6,
        commonsThumbWidth: 1600,
        reasoningEffort: "off",
        // Hint for image pickers to prefer photo-style results.
        preferPhotos: true,
        onProgress: undefined,
        ...options,
    };
    const trace = settings.trace;
    trace?.mark("aiService_enter", { model, includeVisuals: settings.includeVisuals });
    console.log("Beginning to create board data with categories: " + categories);
    //settings.includeVisuals = Boolean(options.includeVisuals);

    if (!categories || categories.length !== 11) {
        throw new Error("You must provide exactly 11 categories.");
    }

    const [firstCategories, secondCategories, finalCategory] = [
        categories.slice(0, 5),
        categories.slice(5, 10),
        categories[10],
    ];

    const modelDef = modelsByValue[model];
    if (!modelDef) throw new Error(`Unknown model: ${model}`);

    const apiCall = providerApiMap[modelDef.provider];
    if (!apiCall) throw new Error(`No API handler for provider: ${modelDef.provider}`);

    const total =
        11 + (settings.includeVisuals ? (plannedVisualSlots(settings) + 1) : 0); // +1 for cache tick
    let done = 0;

    const report = () => {
        const progress = total > 0 ? clamp01(done / total) : 0;
        try {
            settings.onProgress?.({ done, total, progress });
        } catch {
            // never fail generation because of progress reporting
        }
    };

    // initial 0%
    report();

    const tick = (n = 1) => {
        done += n;
        if (done > total) done = total;
        report();
    };

    const limitVisuals = settings.includeVisuals ? makeLimiter(2) : null;
    const limitTts = settings.narrationEnabled ? makeLimiter(3) : null;

    const ttsPromises = [];
    const ttsIds = new Set();

    // Mapping: clueKey -> ttsAssetId
    // clueKey format matches the client: "<boardType>:<value>:<question>".
    const ttsByClueKey = Object.create(null);

    const clueKeyFor = (boardType, clue) => {
        const v = typeof clue?.value === "number" ? clue.value : null;
        const q = String(clue?.question ?? "").trim();
        // If we can't form a key, bail.
        if (!q) return null;
        return `${boardType}:${v ?? "?"}:${q}`;
    };

    const enqueueCategoryTts = (boardType, json) => {
        if (!settings.narrationEnabled || !limitTts) return;

        for (const clue of (json?.values ?? [])) {
            const v = typeof clue?.value === "number" ? clue.value : null;
            const q = String(clue?.question ?? "").trim();
            if (!q) continue;

            const prefix = v ? `For ${v} dollars. ` : "";
            const text = `${prefix}${q}`.trim();

            // Start the async job NOW (do not await here)
            const p = limitTts(async () => {
                try {
                    const asset = await ensureTtsAsset(
                        {
                            text,
                            textType: "text",
                            voiceId: "Matthew",
                            engine: "standard",
                            outputFormat: "mp3",
                        },
                        supabase,
                        trace
                    );

                    ttsIds.add(asset.id);

                    const k = clueKeyFor(boardType, clue);
                    if (k) ttsByClueKey[k] = asset.id;
                } catch (e) {
                    // Don’t fail board generation if TTS has a transient issue
                    console.error("[TTS] ensureTtsAsset failed:", e?.message ?? e);
                }
            });

            ttsPromises.push(p);
        }
    };

    const valuesFor = (double) => (double ? [400, 800, 1200, 1600, 2000] : [200, 400, 600, 800, 1000]);

    const categoryPrompt = (category, double = false) => {
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

        const reasoningRules = settings.reasoningEffort !== "off"
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

        return`
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

    const finalPrompt = (category) => `
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
        `;



    const timed = async (label, fn) => {
        const start = Date.now();
        trace?.mark(`${label} START`);
        try {
            const out = await fn();
            const dur = Date.now() - start;
            trace?.mark(`${label} END (+${dur}ms)`);
            return out;
        } catch (e) {
            const dur = Date.now() - start;
            trace?.mark(`${label} FAIL (+${dur}ms)`);
            throw e;
        }
    };

    trace?.mark("createBoardData BEGIN");

    try {
        // Fire ALL Single categories immediately
        const firstCategoryPromises = firstCategories.map((cat, i) =>
            timed(`SINGLE C${i + 1} (${cat})`, async () => {
                const requestOptions = {
                    reasoningEffort: settings.reasoningEffort, // "off" | "low" | "medium" | "high"
                };

                const r = await apiCall(model, categoryPrompt(cat, false), requestOptions);
                const json = parseProviderJson(r);

                if (!json || typeof json.category !== "string" || !Array.isArray(json.values)) {
                    throw new Error(`Single category ${i} missing {category, values}`);
                }

                return json;
            }).then(async (json) => {
                tick(1);

                enqueueCategoryTts("firstBoard", json);

                if (settings.includeVisuals && limitVisuals) {
                    await limitVisuals(() => populateCategoryVisuals(json, settings, (n) => tick(n)));
                }

                return json;
            })

        );

        // Fire ALL Double categories immediately
        const secondCategoryPromises = secondCategories.map((cat, i) =>
            timed(`DOUBLE C${i + 1} (${cat})`, async () => {
                const requestOptions = {
                    reasoningEffort: settings.reasoningEffort, // "off" | "low" | "medium" | "high"
                };

                const r = await apiCall(model, categoryPrompt(cat, true), requestOptions);
                const json = parseProviderJson(r);

                if (!json || typeof json.category !== "string" || !Array.isArray(json.values)) {
                    throw new Error(`Double category ${i} missing {category, values}`);
                }

                return json;
            }).then(async (json) => {
                tick(1);

                enqueueCategoryTts("secondBoard", json);

                if (settings.includeVisuals && limitVisuals) {
                    await limitVisuals(() => populateCategoryVisuals(json, settings, (n) => tick(n)));
                }

                return json;
            })
        );

        // Fire Final immediately too
        const finalPromise = timed(`FINAL (${finalCategory})`, async () => {
            const requestOptions = {
                reasoningEffort: settings.reasoningEffort, // "off" | "low" | "medium" | "high"
            };
            const r = await apiCall(model, finalPrompt(finalCategory), requestOptions);
            const json = parseProviderJson(r);

            if (!json || typeof json.category !== "string" || !Array.isArray(json.values)) {
                throw new Error("Final jeopardy missing {category, values}");
            }

            return json;
        }).then(async (json) => {
            tick(1);

            enqueueCategoryTts("finalJeopardy", json);

            if (settings.includeVisuals && limitVisuals) {
                await limitVisuals(() => populateCategoryVisuals(json, settings, (n) => tick(n)));
            }

            return json;
        });

        trace?.mark("ALL REQUESTS FIRED");

        // Await them all together (also timed)
        const [firstCategoryResults, secondCategoryResults, finalBuilt] = await timed(
            "AWAIT ALL RESULTS",
            async () =>
                Promise.all([
                    Promise.all(firstCategoryPromises),
                    Promise.all(secondCategoryPromises),
                    finalPromise,
                ])
        );

        if (settings.narrationEnabled && ttsPromises.length > 0) {
            await timed("AWAIT ALL TTS", async () => Promise.all(ttsPromises));
        }

        trace?.mark("ALL RESULTS RECEIVED");

        const firstBoard = { categories: firstCategoryResults };
        const secondBoard = { categories: secondCategoryResults };
        const finalJeopardy = { categories: [finalBuilt] };

        const board = { host, model, firstBoard, secondBoard, finalJeopardy };
        // Visuals are populated per-category as each category returns.
        // Finalize the visual pipeline with one last tick (keeps progress accounting consistent).
        if (settings.includeVisuals) tick(1);

        void saveBoardAsync({ supabase, host, board });

        trace?.mark("createBoardData DONE");
        return {
            firstBoard,
            secondBoard,
            finalJeopardy,
            ttsAssetIds: Array.from(ttsIds),
            ttsByClueKey,
        };
    } catch (error) {
        trace?.mark("createBoardData ERROR");
        console.error("[Server] Error generating board data:", error?.message ?? error);
        console.error(error);
        throw error;
    }
}

export {
    createBoardData,
    createCategoryOfTheDay
};
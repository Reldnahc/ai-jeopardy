import OpenAI from "openai";
import Anthropic from "@anthropic-ai/sdk";
import 'dotenv/config';
import {supabase} from "../config/database.js";
import { modelsByValue } from "../../shared/models.js";
import { pickCommonsImageForQueries } from "./commonsService.js";
import { ingestImageToR2FromUrl } from "./imageAssetService.js";

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

function callOpenAi(model, prompt) {
    return openai.chat.completions.create({
        model: model,
        messages: [{role: "user", content: prompt}],
        response_format: { type: "json_object" },
    });
}

function callDeepseek(model, prompt) {
    return deepseek.chat.completions.create({
        model: model,
        messages: [{role: "user", content: prompt}],
    });
}
function callAnthropic(model, prompt) {
    return anthropic.messages.create({
        model: model,
        system: "Respond only with valid JSON as described. Do not include any other text.",
        max_tokens: 2000,
        messages: [
            {
                "role": "user",
                "content": [
                    {
                        "type": "text",
                        "text": prompt
                    }
                ]
            }
        ]
    });
}

async function createCategoryOfTheDay() {
    console.log("Creating new Category of the day.");
    const prompt = `
        Create a category of the day.
        Think of as many trivia categories as you can. Randomly choose one of these categories.
        Try not to choose the same category you have already chosen.
        create a description for the category.
        the description should be a short single sentence description of the category.
        it should be worded in a fun expressive and brief way.
        Format the response in JSON as:
        {
            "category": "Category Name",
            "description": "description",
        }
    `;
    const response = await callOpenAi("gpt-4o-mini", prompt, 1);
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

async function mapWithConcurrency(items, limit, mapper) {
    const results = new Array(items.length);
    let idx = 0;

    const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
        while (true) {
            const i = idx++;
            if (i >= items.length) return;
            results[i] = await mapper(items[i], i);
        }
    });

    await Promise.all(workers);
    return results;
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

async function populateBoardVisuals(board, settings) {
    if (!settings.includeVisuals) return;

    // Only first + second boards (NO final jeopardy visuals)
    const rounds = [
        board?.firstBoard?.categories,
        board?.secondBoard?.categories,
    ].filter(Array.isArray);

    for (const categories of rounds) {
        for (const cat of categories) {
            const values = Array.isArray(cat?.values) ? cat.values : [];
            const threshold = settings.visualConfidenceThreshold ?? 0.85;
            const visualClues = values
                .filter((c) => c?.visual?.commonsSearchQueries?.length && (c.visual.confidence ?? 0) >= threshold)
                .sort((a, b) => (b?.visual?.confidence ?? 0) - (a?.visual?.confidence ?? 0))
                .slice(0, settings.maxVisualCluesPerCategory);

            for (const clue of visualClues) {
                try {
                    const found = await pickCommonsImageForQueries(
                        clue.visual.commonsSearchQueries,
                        {
                            maxQueries: settings.maxImageSearchTries,
                            searchLimit: 5,
                            trace: settings.trace,
                            preferPhotos: settings.preferPhotos,
                        }
                    );

                    if (!found) {
                        // Could not resolve; remove visual wording
                        clue.question = stripVisualWording(clue.question);
                        delete clue.visual;
                        continue;
                    }

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
                }
            }

            // Cleanup any remaining visual specs if they exceed maxVisualCluesPerCategory
            for (const clue of values) {
                if (clue?.visual) delete clue.visual;
            }
        }
    }
}

async function createBoardData(categories, model, host, options = {}) {
    const settings = {
        includeVisuals: false,
        maxVisualCluesPerCategory: 2,
        maxImageSearchTries: 6,
        // Only accept visual picks when the model is very sure
        visualConfidenceThreshold: 0.85,
        // Pass-through hint for Commons scoring (if implemented)
        preferPhotos: true,
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

    // --- API call tracing / accounting ---
    const callStats = {
        totalCalls: 0,
        byPurpose: {}, // { [purpose]: number }
        byProvider: {}, // { [provider]: number }
        tokens: { prompt: 0, completion: 0, total: 0, knownCalls: 0 },
    };

    const bump = (obj, key, n = 1) => {
        obj[key] = (obj[key] ?? 0) + n;
    };

    const extractUsage = (provider, resp) => {
        try {
            if (!resp) return null;

            // OpenAI/DeepSeek chat.completions shape
            if (resp.usage && typeof resp.usage === "object") {
                const pt = Number(resp.usage.prompt_tokens ?? 0);
                const ct = Number(resp.usage.completion_tokens ?? 0);
                const tt = Number(resp.usage.total_tokens ?? (pt + ct));
                if (Number.isFinite(pt) && Number.isFinite(ct) && Number.isFinite(tt)) {
                    return { prompt: pt, completion: ct, total: tt };
                }
            }

            // Anthropic messages shape: { usage: { input_tokens, output_tokens } }
            if (resp.usage && typeof resp.usage === "object") {
                const pt = Number(resp.usage.input_tokens ?? 0);
                const ct = Number(resp.usage.output_tokens ?? 0);
                const tt = pt + ct;
                if (Number.isFinite(pt) && Number.isFinite(ct)) {
                    return { prompt: pt, completion: ct, total: tt };
                }
            }
        } catch {
            // ignore
        }
        return null;
    };

    const trackedApiCall = async ({ prompt, purpose, meta }) => {
        const provider = modelDef.provider;
        const callId = `${purpose}-${Date.now()}-${Math.random().toString(16).slice(2)}`;

        callStats.totalCalls += 1;
        bump(callStats.byPurpose, purpose);
        bump(callStats.byProvider, provider);

        trace?.mark("ai_call_start", {
            callId,
            provider,
            model,
            purpose,
            ...meta,
        });

        const t0 = Date.now();
        const resp = await apiCall(model, prompt);
        const dt = Date.now() - t0;

        const usage = extractUsage(provider, resp);
        if (usage) {
            callStats.tokens.prompt += usage.prompt;
            callStats.tokens.completion += usage.completion;
            callStats.tokens.total += usage.total;
            callStats.tokens.knownCalls += 1;
        }

        trace?.mark("ai_call_end", {
            callId,
            provider,
            model,
            purpose,
            ms: dt,
            usage: usage ?? undefined,
        });

        return resp;
    };

    const valuesFor = (double) => (double ? [400, 800, 1200, 1600, 2000] : [200, 400, 600, 800, 1000]);


    const categoryPrompt = (category, double = false) => {
        const values = valuesFor(double);

        const outputSchema = `
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
        - Clues are statements (no question marks).
        - Answers are phrased as questions and end with a ?.
        - No repeated facts/answers/phrasing.

        ${outputSchema}

        STRICT:
        - Exactly 5 values.
        - Values must be exactly ${JSON.stringify(values)} in ascending order.
        - No markdown. No extra text. Valid JSON only.
        `.trim();
    };

    const visualSelectionPrompt = (category, categoryJson, double = false) => {
        if (!settings.includeVisuals) return null;
        const values = valuesFor(double);

        return `
        You are helping add OPTIONAL visual clues to an existing Jeopardy category.

        Category: "${category}"

        Decide whether ANY of the 5 clues should become visual (image-based). Most categories should have 0–1 visual clues.
        Only choose a clue as visual if you are VERY SURE a clear PHOTO exists on Wikimedia Commons and the clue is solvable from the image alone.

        HARD RULES (must all be true for visual):
        - Subject is a real-world, photographable thing: landmark/building, animal species, famous sculpture/painting, recognizable physical object, or globally famous person with abundant Commons photos.
        - NOT a logo, icon, map, diagram, chart, flag (unless extremely iconic), abstract concept, law/treaty/event, or anything that needs text explanation.
        - A single image should clearly identify the answer without requiring extra facts.
        - Provide a tight Commons-friendly query (2–6 words). No URLs.
        - Only mark visual when confidence >= ${settings.visualConfidenceThreshold ?? 0.85}.

        OUTPUT JSON ONLY in this exact shape:
        {
          "visuals": [
            {
              "value": ${values[0]},
              "question": "New clue text that depends on the image (do NOT give away the answer).",
              "visual": {
                "subject": "Concrete noun phrase of what is shown",
                "commonsSearchQueries": ["query 1", "query 2"],
                "confidence": 0.0
              }
            }
          ]
        }

        NOTES:
        - "visuals" may be an empty array.
        - Choose at most ${settings.maxVisualCluesPerCategory} visuals total.
        - Keep the original answers unchanged.
        - If you are not very sure, return an empty array.

        EXISTING CATEGORY JSON (do not change it directly; choose visuals from it):
        ${JSON.stringify(categoryJson)}
        `.trim();
    };

    const applyVisualSelections = (categoryJson, visualsJson) => {
        if (!settings.includeVisuals) return categoryJson;

        const threshold = settings.visualConfidenceThreshold ?? 0.85;
        const visuals = Array.isArray(visualsJson?.visuals) ? visualsJson.visuals : [];

        // Keep only high-confidence, well-formed visual specs
        const cleaned = visuals
            .filter((v) =>
                v &&
                typeof v.value === "number" &&
                typeof v.question === "string" &&
                v.visual &&
                Array.isArray(v.visual.commonsSearchQueries) &&
                v.visual.commonsSearchQueries.length > 0 &&
                typeof v.visual.confidence === "number" &&
                v.visual.confidence >= threshold
            )
            .sort((a, b) => (b.visual.confidence ?? 0) - (a.visual.confidence ?? 0))
            .slice(0, settings.maxVisualCluesPerCategory);

        for (const v of cleaned) {
            const clue = categoryJson.values.find((c) => c?.value === v.value);
            if (!clue) continue;

            // Replace question with the image-dependent version
            clue.question = v.question.trim();

            clue.visual = {
                subject: typeof v.visual.subject === "string" ? v.visual.subject.trim() : undefined,
                commonsSearchQueries: v.visual.commonsSearchQueries.map((q) => String(q).trim()).filter(Boolean).slice(0, 6),
                confidence: v.visual.confidence,
            };
        }

        return categoryJson;
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
                const r = await trackedApiCall({ prompt: categoryPrompt(cat, false), purpose: "category_generate", meta: { round: "first", category: cat } });
                const json = parseProviderJson(r);

                if (!json || typeof json.category !== "string" || !Array.isArray(json.values)) {
                    throw new Error(`Single category ${i} missing {category, values}`);
                }

                if (settings.includeVisuals) {
                    try {
                        const vp = visualSelectionPrompt(cat, json, false);
                        if (vp) {
                            const vr = await trackedApiCall({ prompt: vp, purpose: "visual_select", meta: { round: "first", category: cat } });
                            const vjson = parseProviderJson(vr);
                            applyVisualSelections(json, vjson);
                        }
                    } catch (e) {
                        // Fail-soft: keep category text-only
                    }
                }

                return json;
            })
        );

        // Fire ALL Double categories immediately
        const secondCategoryPromises = secondCategories.map((cat, i) =>
            timed(`DOUBLE C${i + 1} (${cat})`, async () => {
                const r = await trackedApiCall({ prompt: categoryPrompt(cat, true), purpose: "category_generate", meta: { round: "second", category: cat } });
                const json = parseProviderJson(r);

                if (!json || typeof json.category !== "string" || !Array.isArray(json.values)) {
                    throw new Error(`Double category ${i} missing {category, values}`);
                }

                if (settings.includeVisuals) {
                    try {
                        const vp = visualSelectionPrompt(cat, json, true);
                        if (vp) {
                            const vr = await trackedApiCall({ prompt: vp, purpose: "visual_select", meta: { round: "second", category: cat } });
                            const vjson = parseProviderJson(vr);
                            applyVisualSelections(json, vjson);
                        }
                    } catch (e) {
                        // Fail-soft: keep category text-only
                    }
                }

                return json;
            })
        );

        // Fire Final immediately too
        const finalPromise = timed(`FINAL (${finalCategory})`, async () => {
            const r = await trackedApiCall({ prompt: finalPrompt(finalCategory), purpose: "final_generate", meta: { category: finalCategory } });
            const json = parseProviderJson(r);

            if (!json || typeof json.category !== "string" || !Array.isArray(json.values)) {
                throw new Error("Final jeopardy missing {category, values}");
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

        trace?.mark("ALL RESULTS RECEIVED");

        const firstBoard = { categories: firstCategoryResults };
        const secondBoard = { categories: secondCategoryResults };
        const finalJeopardy = { categories: [finalBuilt] };

        const board = { host, model, firstBoard, secondBoard, finalJeopardy };

        await populateBoardVisuals(board, settings);

        void saveBoardAsync({ supabase, host, board });


        trace?.mark("ai_call_summary", {
            totalCalls: callStats.totalCalls,
            byPurpose: callStats.byPurpose,
            byProvider: callStats.byProvider,
            tokens: callStats.tokens,
        });

        // Optional console summary (helps when trace is disabled)
        console.log("[ai] calls:", callStats.totalCalls, "byPurpose:", callStats.byPurpose, "byProvider:", callStats.byProvider);
        if (callStats.tokens.knownCalls > 0) {
            console.log("[ai] tokens (knownCalls=" + callStats.tokens.knownCalls + "):", callStats.tokens);
        } else {
            console.log("[ai] tokens: provider did not return usage data");
        }
        trace?.mark("createBoardData DONE");
        return { firstBoard, secondBoard, finalJeopardy };
    } catch (error) {

        trace?.mark("ai_call_summary", {
            totalCalls: callStats.totalCalls,
            byPurpose: callStats.byPurpose,
            byProvider: callStats.byProvider,
            tokens: callStats.tokens,
        });
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
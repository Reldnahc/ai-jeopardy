// aiService.js
import OpenAI from "openai";
import Anthropic from "@anthropic-ai/sdk";
import 'dotenv/config';
import {supabase} from "../config/database.js";
import { modelsByValue } from "../../shared/models.js";

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

async function createBoardData(categories, model, host) {
    console.log("Beginning to create board data with categories: " + categories);

    if (!categories || categories.length !== 11) {
        // note: your original code referenced `res` here, but this is a service fn
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

    const valuesFor = (double) => (double ? [400, 800, 1200, 1600, 2000] : [200, 400, 600, 800, 1000]);

    const categoryPrompt = (category, double = false) => `
        You are a professional Jeopardy clue writer.
        
        Write ONE complete Jeopardy category: "${category}"
        
        RULES:
        - Exactly 5 clues with values ${double ? "400, 800, 1200, 1600, 2000" : "200, 400, 600, 800, 1000"}.
        - Difficulty must strictly increase with value.
        - Clues must be factual, unambiguous, verifiable.
        - Do NOT include the category title verbatim in any clue or answer.
        - Clues are statements (no question marks).
        - Answers must be phrased as questions and end with a ?.
        - No repeated facts/answers/phrasing within this category.
        
        OUTPUT: Return ONLY valid JSON in this exact shape:
        
        {
          "category": "Category Name",
          "values": [
            { "value": ${double ? 400 : 200}, "question": "Clue text", "answer": "Correct response phrased as a question?" }
          ]
        }
        
        STRICT:
        - Exactly 5 values.
        - Values must be exactly ${JSON.stringify(valuesFor(double))} in ascending order.
        - No markdown. No extra text. Valid JSON only.
        `;


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


    const t0 = Date.now();
    const mark = (label) => console.log(`[timing] ${label}: ${Date.now() - t0}ms`);

    const timed = async (label, fn) => {
        const start = Date.now();
        mark(`${label} START`);
        try {
            const out = await fn();
            const dur = Date.now() - start;
            mark(`${label} END (+${dur}ms)`);
            return out;
        } catch (e) {
            const dur = Date.now() - start;
            mark(`${label} FAIL (+${dur}ms)`);
            throw e;
        }
    };

    mark("createBoardData BEGIN");

    try {
        // Fire ALL Single categories immediately
        const firstCategoryPromises = firstCategories.map((cat, i) =>
            timed(`SINGLE C${i + 1} (${cat})`, async () => {
                const r = await apiCall(model, categoryPrompt(cat, false));
                const json = parseProviderJson(r);

                if (!json || typeof json.category !== "string" || !Array.isArray(json.values)) {
                    throw new Error(`Single category ${i} missing {category, values}`);
                }

                return json;
            })
        );

        // Fire ALL Double categories immediately
        const secondCategoryPromises = secondCategories.map((cat, i) =>
            timed(`DOUBLE C${i + 1} (${cat})`, async () => {
                const r = await apiCall(model, categoryPrompt(cat, true));
                const json = parseProviderJson(r);

                if (!json || typeof json.category !== "string" || !Array.isArray(json.values)) {
                    throw new Error(`Double category ${i} missing {category, values}`);
                }

                return json;
            })
        );

        // Fire Final immediately too
        const finalPromise = timed(`FINAL (${finalCategory})`, async () => {
            const r = await apiCall(model, finalPrompt(finalCategory));
            const json = parseProviderJson(r);

            if (!json || typeof json.category !== "string" || !Array.isArray(json.values)) {
                throw new Error("Final jeopardy missing {category, values}");
            }

            return json;
        });

        mark("ALL REQUESTS FIRED");

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

        mark("ALL RESULTS RECEIVED");

        const firstBoard = { categories: firstCategoryResults };
        const secondBoard = { categories: secondCategoryResults };
        const finalJeopardy = { categories: [finalBuilt] };

        const board = { host, model, firstBoard, secondBoard, finalJeopardy };

        void saveBoardAsync({ supabase, host, board });

        mark("createBoardData DONE");
        return { firstBoard, secondBoard, finalJeopardy };
    } catch (error) {
        mark("createBoardData ERROR");
        console.error("[Server] Error generating board data:", error?.message ?? error);
        console.error(error);
        throw error;
    }
}

export {
    createBoardData,
    createCategoryOfTheDay
};
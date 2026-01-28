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

function callOpenAi(model, prompt, temp) {
    return openai.chat.completions.create({
        model: model,
        messages: [{role: "user", content: prompt}],
        response_format: { type: "json_object" },
        temperature: temp,
    });
}

function callDeepseek(model, prompt, temp) {
    return deepseek.chat.completions.create({
        model: model,
        messages: [{role: "user", content: prompt}],
        temperature: temp,
    });
}
function callAnthropic(model, prompt, temp) {
    return anthropic.messages.create({
        model: model,
        temperature: temp,
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

async function createBoardData(categories, model, host, temperature) {
    console.log("Beginning to create board data with categories: " + categories);

    if (!categories || categories.length !== 11) {
        return res.status(400).json({error: 'You must provide exactly 11 categories.'});
    }

    const [firstCategories, secondCategories, finalCategory] = [categories.slice(0, 5), categories.slice(5, 10), categories[10]];

    const prompt = (categories, double = false) => `
        You are a professional Jeopardy clue writer.
        
        Create a complete Jeopardy board using EXACTLY these 5 categories:
        ${categories.map((c, i) => `${i + 1}. ${c}`).join("\n")}
        
        RULES:
        - Exactly 5 clues per category.
        - Values must be ${double ? "400, 800, 1200, 1600, 2000" : "200, 400, 600, 800, 1000"}.
        - Difficulty must strictly increase with value.
        - Clues must be factual, unambiguous, and verifiable.
        - No repeated facts, answers, or distinctive phrasing anywhere.
        - Do NOT include the category title in any clue or answer.
        - Clues are statements (no question marks).
        - Answers must be phrased as questions and end with a ?.
        
        DIFFICULTY:
        - Lowest values: common knowledge.
        - Middle values: reasoning or deeper familiarity.
        - Highest values: challenging even for enthusiasts.
        ${double ? "- Double Jeopardy clues should be noticeably harder overall." : ""}
        
        AVOID:
        - Trick questions, riddles, or wordplay-only clues.
        - Obvious giveaways (dates, names, or direct matches).
        - Subjective or opinion-based answers.
        - Meta commentary or explanations.
        
        OUTPUT:
        Return ONLY valid JSON in this exact structure:
        
        {
          "categories": [
            {
              "category": "Category Name",
              "values": [
                { "value": 200, "question": "Clue text", "answer": "Correct response phrased as a question?" }
              ]
            }
          ]
        }
        
        STRICT REQUIREMENTS:
        - Exactly 5 categories.
        - Exactly 5 values per category.
        - Values must be exactly ${double ? "[400,800,1200,1600,2000]" : "[200,400,600,800,1000]"} in ascending order.
        - No markdown. No extra text. Valid JSON only.
        `;


    const finalPrompt = (category) => `
        You are a professional Jeopardy clue writer.
        
        Create a SINGLE Final Jeopardy clue for this category:
        "${category}"
        
        RULES:
        - Exactly ONE clue and ONE correct response.
        - Very difficult (Final Jeopardy level).
        - Factual, unambiguous, verifiable.
        - Do NOT include the category title verbatim in the clue or answer.
        - Do NOT include the answer text (or near-paraphrase) in the clue.
        - Clue is a statement (no question mark).
        - Response is phrased as a question ("What is…", "Who is…", etc.).
        
        OUTPUT FORMAT:
        Return ONLY valid JSON in this structure:
        
        {
          "categories": [
            {
              "category": "Category Name",
              "values": [
                { "question": "Clue text", "answer": "Correct response phrased as a question" }
              ]
            }
          ]
        }
        
        Do NOT wrap the JSON in markdown.
        Do NOT include any text outside the JSON.
        
        SELF-CHECK (DO NOT OUTPUT THIS SECTION):
        - Valid JSON only.
        - Exactly one category, exactly one value.
        - "question" has no question mark.
        - "answer" is a question starting with Who/What/Where/When/Which.
        - No category-title leakage; no answer giveaway.
        If any check fails, rewrite and re-check. Output ONLY the final JSON when valid.
    `;

    try {

        const modelDef = modelsByValue[model];

        if (!modelDef) {
            throw new Error(`Unknown model: ${model}`);
        }

        const apiCall = providerApiMap[modelDef.provider];

        if (!apiCall) {
            throw new Error(`No API handler for provider: ${modelDef.provider}`);
        }

        const effectiveTemp = modelDef.hideTemp ? (modelDef.presetTemp ?? 0) : temperature;

        const t0 = Date.now();
        const mark = (label) => console.log(`[timing] ${label}: ${Date.now() - t0}ms`);

        mark("before starting requests");

        const firstBoardPromise = apiCall(model, prompt(firstCategories), effectiveTemp)
            .then(r => { mark("first board done"); return r; });

        const secondBoardPromise = apiCall(model, prompt(secondCategories, true), effectiveTemp)
            .then(r => { mark("second board done"); return r; });

        const finalBoardPromise = apiCall(model, finalPrompt(finalCategory), effectiveTemp)
            .then(r => { mark("final done"); return r; });

        const [firstResponse, secondResponse, finalResponse] =
            await Promise.all([firstBoardPromise, secondBoardPromise, finalBoardPromise]);

        mark("all done");

        let firstBoard;
        let secondBoard;
        let finalJeopardy;

        if (firstResponse.content && firstResponse.content[0]) {
            firstBoard = JSON.parse(firstResponse.content[0].text.replace(/```(?:json)?/g, "").trim());
            secondBoard = JSON.parse(secondResponse.content[0].text.replace(/```(?:json)?/g, "").trim());
            finalJeopardy = JSON.parse(finalResponse.content[0].text.replace(/```(?:json)?/g, "").trim());
        } else {
            firstBoard = JSON.parse(firstResponse.choices[0].message.content.replace(/```(?:json)?/g, "").trim());
            secondBoard = JSON.parse(secondResponse.choices[0].message.content.replace(/```(?:json)?/g, "").trim());
            finalJeopardy = JSON.parse(finalResponse.choices[0].message.content.replace(/```(?:json)?/g, "").trim());
        }

        const board = {
            host,
            model,
            firstBoard,
            secondBoard,
            finalJeopardy,
        }

        const response = await supabase
            .from('profiles')
            .select('id')
            .eq('username', host.toLowerCase())
            .single();

        console.log(response);

        if (response.data && response.data.id){
            const { data, error } = await supabase
                .from('jeopardy_boards')
                .insert([{ board, owner: response.data.id }]);
            if (data) {
                console.log('Board saved successfully:', data);
            }
            if (error) {
                console.log('Error:', error);
            }
        }

        return {firstBoard, secondBoard, finalJeopardy};
    } catch (error) {
        console.error('[Server] Error generating board data:', error.message);
        console.error(error);
    }
}

export {
    createBoardData,
    createCategoryOfTheDay
};
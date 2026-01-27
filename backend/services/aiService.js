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
        store: true,
        temperature: temp,
    });
}

function callDeepseek(model, prompt, temp) {
    return deepseek.chat.completions.create({
        model: model,
        messages: [{role: "user", content: prompt}],
        store: true,
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
        
        Create a complete Jeopardy board using the following EXACTLY 5 categories:
        ${categories.map((c, i) => `${i + 1}. ${c}`).join('\n')}
        
        GENERAL RULES:
        - Each category MUST contain exactly 5 clues.
        - Clue values must be ${double ? '400, 800, 1200, 1600, 2000' : '200, 400, 600, 800, 1000'}.
        - Difficulty MUST scale strictly with value.
        - Clues MUST be factual, unambiguous, and verifiable.
        - Do NOT reuse facts, answers, or phrasing across clues or categories.
        - Avoid obvious giveaways (dates, names, or key phrases directly matching the answer).
        - The category title must NOT appear in the clue or answer.
        - Clues must be written in Jeopardy answer format (statements, not questions).
        - Player responses MUST be phrased as a question (e.g., "What is…", "Who is…").
        
        DIFFICULTY GUIDELINES:
        - Lowest value: common knowledge, accessible to casual players.
        - Middle values: require reasoning, inference, or deeper familiarity.
        - Highest values: challenging even for enthusiasts; obscure facts, multi-step reasoning, or indirect references.
        ${double ? '- All clues should be noticeably harder than standard Jeopardy.\n- 1200+ value clues should be genuinely difficult.' : ''}
        
        CONTENT QUALITY RULES:
        - Do NOT include trick questions, wordplay-only clues, or riddles.
        - Avoid “this X that Y” phrasing when possible.
        - No pop culture unless the category clearly implies it.
        - Avoid subjective or opinion-based answers.
        - Do NOT include meta commentary, explanations, or apologies.
        
        OUTPUT FORMAT:
        Return ONLY valid JSON in the following structure:
        
        {
          "categories": [
            {
              "category": "Category Name",
              "values": [
                { "value": 200, "question": "Clue text", "answer": "Correct response phrased as a question" }
              ]
            }
          ]
        }
        
        Do NOT wrap the JSON in markdown.
        Do NOT include any text outside the JSON.
        SELF-CHECK (DO NOT OUTPUT THIS SECTION):
        Before producing the final JSON, silently validate and repair until ALL checks pass:
        
        STRUCTURE CHECKS
        - Output is valid JSON (no trailing commas, no markdown, no extra text).
        - Exactly 5 categories.
        - Each category has exactly 5 values.
        - Values are exactly ${double ? '[400,800,1200,1600,2000]' : '[200,400,600,800,1000]'} in ascending order.
        
        CONTENT CHECKS
        - Every "answer" is phrased as a question (starts with "Who is", "What is", "Where is", etc.).
        - Clue text ("question") is a statement, not a question (no question marks).
        - Category title does not appear verbatim in the clue or answer.
        - No clue contains the full answer text (or a near-exact paraphrase) as a giveaway.
        - No duplicate answers across the entire board.
        - No repeated distinctive phrasing across clues.
        
        DIFFICULTY CHECKS
        - 200/400 are broadly accessible.
        - Higher values become progressively harder; top value in each category is the hardest.
        
        If any check fails, rewrite ONLY the failing clues/categories and re-check.
        When all checks pass, output ONLY the final JSON.
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

        const firstBoardPromise = apiCall(model, prompt(firstCategories), effectiveTemp);
        const secondBoardPromise = apiCall(model, prompt(secondCategories, true), effectiveTemp);
        const finalBoardPromise = apiCall(model, finalPrompt(finalCategory), effectiveTemp);

        const [firstResponse, secondResponse, finalResponse] = await Promise.all([firstBoardPromise, secondBoardPromise, finalBoardPromise]);

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
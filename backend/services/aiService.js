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
        Create a Jeopardy board with the following 5 categories: ${categories.join(', ')}.
        Each category should contain 5 questions, each with a value and an answer. Make sure they follow the jeopardy format.
        Each answer should be formated in question like jeopardy. The questions should be more difficult according to their value. 
        The Questions should avoid having the answer in the clue or category title. 
        ${double ? 'Make this a Double Jeopardy board, ensuring values are doubled, ranging from 400 to 2000 instead of 200 to 1000. ' +
        'they should be more difficult according to their value. questions over 500 points should be hard.' : ''}
        Format the response in JSON as:
        {
           "categories": [
                {
                    "category": "Category Name",
                    "values": [
                        { "value": 200, "question": "Question", "answer": "Answer?" },
                        // More values...
                    ]
                },
                // More categories...
            ]
        }
    `;
    const finalPrompt = (category) => `
         Generate me Json for a very difficult question in this category ${category}.
         It should be a very difficult question. Make sure it follows the jeopardy format.
         The answer should be formated in question like jeopardy.
         Format the response in JSON as:
          {
            "categories": [
               {
                   "category": "Category Name",
                   "values": [
                       { "question": "Question", "answer": "Answer?" },
                   ]
               },
            ]
        }
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
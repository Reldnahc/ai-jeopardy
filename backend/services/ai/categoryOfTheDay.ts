import { callOpenAiJson, parseOpenAiJson } from "./openaiClient.js";

export type CategoryOfTheDay = {
    category: string;
    description: string;
};

export async function createCategoryOfTheDay(): Promise<CategoryOfTheDay> {
    const prompt = `
Create a category of the day.
Create a description for the category.
The description should be a short single sentence description of the category.
It should be worded in a fun expressive and brief way.

Return JSON only:
{
  "category": "Category Name",
  "description": "description"
}
  `.trim();

    const response = await callOpenAiJson("gpt-4o-mini", prompt, {});
    return parseOpenAiJson<CategoryOfTheDay>(response);
}

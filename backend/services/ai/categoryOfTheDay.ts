import { callOpenAiJson, parseOpenAiJson } from "./openaiClient.js";
import { appConfig } from "../../config/appConfig.js";

export type CategoryOfTheDay = {
    category: string;
    description: string;
};

// in-memory history (resets on restart)
const RECENT_MAX = 40;
const recent: string[] = [];

function norm(s: string) {
    return s.trim().toLowerCase();
}

function pushRecent(category: string) {
    const n = norm(category);
    const idx = recent.indexOf(n);
    if (idx >= 0) recent.splice(idx, 1);
    recent.unshift(n);
    if (recent.length > RECENT_MAX) recent.pop();
}

// super simple “shape” heuristic (helps reduce same-y naming patterns)
function categoryShape(category: string): string {
    const words = category.trim().split(/\s+/);
    if (words.length === 1) return "1w";
    if (words.length === 2) return "2w";
    if (words.length === 3) return "3w";
    return "4w+";
}

// optional: track recent shapes too
const recentShapes: string[] = [];
const SHAPES_MAX = 12;

function pushShape(shape: string) {
    recentShapes.unshift(shape);
    if (recentShapes.length > SHAPES_MAX) recentShapes.pop();
}

function isTooSimilar(candidate: string): boolean {
    const c = norm(candidate);
    if (recent.includes(c)) return true;

    // basic “near repeat” check (substring overlap)
    // catches stuff like "Whimsical Wonder" vs "Whimsical Wonders"
    for (const r of recent) {
        if (r.includes(c) || c.includes(r)) return true;
    }

    return false;
}

async function generateOnce(): Promise<CategoryOfTheDay> {
    const prompt = `
Create a "Category of the Day" for a Jeopardy-style game.

Hard rules:
- Must be NEW: do not repeat or closely remix any recent categories listed below.
- Keep it broadly playable (no super niche jargon).
- Category: 2–5 words, Title Case.
- Description: exactly 1 sentence, 8–16 words, fun and vivid.
- No emojis. No quotes. Avoid colons in the category.

Soft goals (do your best):
- Increase variety in naming style: don't overuse the same vibe or word pattern day after day.
- If a popular phrase happens to fit (e.g., "Whimsical Wonders"), it is allowed, but prefer something different unless it’s truly the best idea.

Recent categories to avoid:
${recent.length ? recent.map((c) => `- ${c}`).join("\n") : "- (none yet)"}

Recently-used category lengths (avoid repeating the same length again if possible):
${recentShapes.length ? recentShapes.join(", ") : "(none yet)"}

Return JSON only:
{
  "category": "Category Name",
  "description": "One sentence description."
}
`.trim();

    const response = await callOpenAiJson(appConfig.ai.cotdModel, prompt, {});

    return parseOpenAiJson<CategoryOfTheDay>(response);
}

export async function createCategoryOfTheDay(): Promise<CategoryOfTheDay> {
    // attempt 1
    let out = await generateOnce();

    // validate & retry once if too similar
    if (isTooSimilar(out.category)) {
        const prompt2 = `
The previous category was too similar to recent ones.
Generate a DIFFERENT category with a different wording and theme.
Return JSON only with the same schema.
`.trim();

        const response2 = await callOpenAiJson(appConfig.ai.cotdModel, prompt2, {
            // temperature: 1.1,
            // presence_penalty: 0.7,
        });

        out = parseOpenAiJson<CategoryOfTheDay>(response2);
    }

    // record
    pushRecent(out.category);
    pushShape(categoryShape(out.category));

    return out;
}

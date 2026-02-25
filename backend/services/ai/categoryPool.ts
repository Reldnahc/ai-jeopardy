import { env } from "../../config/env.js";
import { callOpenAiJson, parseOpenAiJson } from "./openaiClient.js";

type CategoryPoolResponse = {
  categories?: unknown;
};

function cleanCategory(s: unknown): string {
  return String(s ?? "").replace(/\s+/g, " ").trim();
}

export async function generateCategoryPoolFromOpenAi(opts: {
  count: number;
  model?: string;
  prompt?: string;
}): Promise<string[]> {
  const count = Math.max(20, Math.min(200, Math.floor(opts.count)));
  const model = opts.model || env.OPENAI_CATEGORY_POOL_MODEL;
  const userPrompt = String(opts.prompt ?? "").trim();

  const prompt = [
    "You are generating a pool of Jeopardy category titles.",
    `Return JSON only: {"categories": [string, ...]} with exactly ${count} unique category names.`,
    "Requirements:",
    "- Each category should be short (1-4 words), punchy, and broadly themed.",
    "- Avoid duplicates, near-duplicates, and trivial variants.",
    "- Avoid offensive content.",
    "- Use Title Case when appropriate.",
    userPrompt ? `User prompt: ${userPrompt}` : "",
  ]
    .filter(Boolean)
    .join("\n");

  const raw = await callOpenAiJson(model, prompt);
  const parsed = parseOpenAiJson<CategoryPoolResponse>(raw);
  const arr = Array.isArray(parsed?.categories) ? parsed.categories : [];

  const seen = new Set<string>();
  const out: string[] = [];

  for (const item of arr) {
    const cleaned = cleanCategory(item);
    if (!cleaned) continue;
    const key = cleaned.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(cleaned);
  }

  if (out.length === 0) {
    throw new Error("OpenAI returned no categories.");
  }

  return out.slice(0, count);
}

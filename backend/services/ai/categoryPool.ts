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
    "- Each category should be short (1-4 words), punchy, and game-ready.",
    "- Categories MUST be specific to the user prompt when provided. Do not be generic.",
    "- If the prompt implies concrete entities (e.g., TV shows, movies, bands, books), output specific titles or names, not broad topics.",
    "- If the prompt is a domain (e.g., space) without a request for specific entities, generate focused subtopics.",
    "- Avoid generic buckets like \"TV Shows\", \"Movies\", \"History\", \"Sports\", \"Pop Culture\" unless explicitly asked.",
    "- Avoid duplicates, near-duplicates, and trivial variants.",
    "- Avoid offensive content.",
    "- Use Title Case when appropriate.",
    "Examples:",
    "- Prompt: TV shows -> Stranger Things, Breaking Bad, The Office, Game of Thrones, The Simpsons, The Wire",
    "- Prompt: Space -> Moons & Rings, Space Probes, Exoplanets, Astronauts, Space Telescopes, Planetary Missions",
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

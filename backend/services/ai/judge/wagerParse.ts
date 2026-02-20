// backend/services/ai/judge/wagerParse.ts
import { callOpenAiJson, parseOpenAiJson } from "../openaiClient.js";
import { appConfig } from "../../../config/appConfig.js";

export type WagerParseResult = {
  wager: number | null;
  reason: string | null; // e.g. "ok" | "empty" | "too-high" | "negative" | "no-number" | "ambiguous" | "model-invalid"
  confidence: number; // 0..1
  transcript: string; // normalized transcript we parsed
};

function clamp01(n: number): number {
  return Math.max(0, Math.min(1, n));
}

function asInt(n: unknown): number | null {
  const v = typeof n === "number" ? n : Number(n);
  if (!Number.isFinite(v)) return null;
  const i = Math.trunc(v);
  return Number.isFinite(i) ? i : null;
}

// Your old deterministic parser, with a couple small tweaks.
export function parseWagerDeterministic(transcriptRaw: string, maxWager: number): WagerParseResult {
  const transcript = String(transcriptRaw || "")
    .trim()
    .toLowerCase();

  if (!transcript) {
    return { wager: null, reason: "empty", confidence: 1, transcript };
  }

  // True DD / all-in phrases
  if (
    transcript.includes("true daily double") ||
    transcript.includes("daily double") ||
    transcript.includes("all in") ||
    transcript.includes("all of it") ||
    transcript.includes("everything") ||
    transcript.includes("my whole score") ||
    transcript.includes("my entire score")
  ) {
    return { wager: Math.max(0, maxWager), reason: "ok", confidence: 0.9, transcript };
  }

  // Digits (supports commas/$)
  const m = transcript.match(/\b(\$?\s*\d{1,6}(?:,\d{3})*)\b/);
  if (m) {
    const cleaned = String(m[1]).replace(/[^0-9]/g, "");
    const n = Number(cleaned);

    if (!Number.isFinite(n)) return { wager: null, reason: "nan", confidence: 0.9, transcript };
    if (n < 0) return { wager: null, reason: "negative", confidence: 0.9, transcript };
    if (n > maxWager) return { wager: null, reason: "too-high", confidence: 0.9, transcript };

    if (n < 5 && !transcript.includes("five") && !transcript.includes("one")) {
      return { wager: null, reason: "ambiguous", confidence: 0.6, transcript };
    }

    return { wager: n, reason: "ok", confidence: 0.95, transcript };
  }

  return { wager: null, reason: "no-number", confidence: 0.7, transcript };
}

function buildWagerPrompt(args: { transcript: string; maxWager: number }) {
  const { transcript, maxWager } = args;

  // IMPORTANT: keep the model constrained and force JSON.
  return `
You are a strict parser for spoken Jeopardy Daily Double wagers.

Task:
- Interpret the player's spoken wager from a noisy speech-to-text transcript.
- The wager must be an INTEGER number of dollars between 0 and ${maxWager} inclusive.
- If the transcript clearly indicates "true daily double" / "all in" / "everything" etc, wager = ${maxWager}.
- If the transcript contains a number in words (e.g. "five thousand", "two hundred", "fifty", "one grand"), convert it to digits.
- If multiple numbers appear, choose the one that most plausibly represents the wager (ignore years like 1999, clue values, etc).
- If the transcript is empty, ambiguous, negative, or exceeds maxWager, return wager=null and explain why in "reason".

Return STRICT JSON ONLY (no markdown, no extra text) with this exact shape:
{
  "wager": number | null,
  "confidence": number,   // 0 to 1
  "reason": string | null // "ok" or a short reason like: "empty", "ambiguous", "too-high", "negative", "no-number"
}

Transcript:
${JSON.stringify(transcript)}
`.trim();
}

export async function parseDailyDoubleWager(args: {
  transcriptRaw: string;
  maxWager: number;
}): Promise<WagerParseResult> {
  const maxWager = Math.max(0, Math.trunc(Number(args.maxWager || 0)));

  const quick = parseWagerDeterministic(args.transcriptRaw, maxWager);

  if (quick.wager !== null) return quick;

  if (
    quick.reason === "too-high" ||
    quick.reason === "negative" ||
    quick.reason === "ambiguous" ||
    quick.reason === "nan"
  ) {
    return quick;
  }

  const transcript = String(args.transcriptRaw || "").trim();
  if (!transcript) return quick; // empty => don't call model

  // model fallback (only for "no-number" style cases)
  const prompt = buildWagerPrompt({ transcript, maxWager });
  const model = String(appConfig.ai.judgeModel);

  const r = await callOpenAiJson(model, prompt, { reasoningEffort: "off" });

  let parsed: unknown = null;
  try {
    parsed = parseOpenAiJson(r);
  } catch {
    parsed = null;
  }

  const obj = parsed as
    | { wager?: unknown; confidence?: unknown; reason?: unknown }
    | null
    | undefined;

  const wager = asInt(obj?.wager ?? null);
  const confidence = clamp01(
    typeof obj?.confidence === "number" ? obj.confidence : Number(obj?.confidence ?? 0.5),
  );
  const reason = obj?.reason == null ? null : String(obj.reason || "").trim() || null;

  if (wager === null) {
    return {
      wager: null,
      reason: reason ?? "no-number",
      confidence,
      transcript: transcript.toLowerCase(),
    };
  }

  if (wager < 0) {
    return {
      wager: null,
      reason: "negative",
      confidence: Math.min(confidence, 0.9),
      transcript: transcript.toLowerCase(),
    };
  }

  if (wager > maxWager) {
    return {
      wager: null,
      reason: "too-high",
      confidence: Math.min(confidence, 0.9),
      transcript: transcript.toLowerCase(),
    };
  }

  return { wager, reason: "ok", confidence, transcript: transcript.toLowerCase() };
}

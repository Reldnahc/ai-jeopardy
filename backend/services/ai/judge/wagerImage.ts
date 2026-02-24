import { appConfig } from "../../../config/appConfig.js";
import { callOpenAiJson, parseOpenAiJson } from "../openaiClient.js";

type ParsedWagerImage = {
  wager: number | null;
  transcript: string;
  confidence: number;
  reason: string | null;
};

function coerceInt(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return Math.trunc(v);
  if (typeof v === "string") {
    const n = Number(v.replace(/[,\s$]/g, ""));
    if (Number.isFinite(n)) return Math.trunc(n);
  }
  return null;
}

function parseSignedIntFromTranscript(transcript: string): number | null {
  const matches = String(transcript || "").match(/-?\d[\d,\s]*/g);
  if (!matches?.length) return null;

  const nums = matches.map((m) => Number(m.replace(/[,\s]/g, ""))).filter(Number.isFinite);

  if (!nums.length) return null;
  return Math.trunc(nums[0]);
}

export async function parseFinalWagerImage(
  imageUrl: string,
  maxWager: number,
): Promise<ParsedWagerImage> {
  const safeMax = Math.max(0, Math.trunc(Number(maxWager) || 0));

  if (!imageUrl || safeMax <= 0) {
    return { wager: 0, transcript: "", confidence: 1, reason: "zero-max" };
  }

  const prompt = `
You are reading a player's handwritten Final Jeopardy wager from an image.
Extract the written amount and return STRICT JSON ONLY:
{ "transcript": string, "wager": number | null, "confidence": number, "reason": string | null }

Rules:
- transcript: what the player wrote (best effort).
- wager should be the INTEGER amount written (can be negative if player wrote a minus sign).
- If the amount is blank or unreadable, set wager=null and reason="unreadable".
- If uncertain between multiple amounts, set wager=null and reason="ambiguous".
`.trim();

  try {
    const r = await callOpenAiJson(appConfig.ai.imageJudgeModel, prompt, { image: imageUrl });
    const parsed = parseOpenAiJson<{
      transcript?: unknown;
      wager?: unknown;
      confidence?: unknown;
      reason?: unknown;
    }>(r);

    const transcript = String(parsed?.transcript ?? "");
    const modelWager = coerceInt(parsed?.wager);
    const confidence =
      typeof parsed?.confidence === "number" && Number.isFinite(parsed.confidence)
        ? Math.max(0, Math.min(1, parsed.confidence))
        : 0.6;
    const reason = parsed?.reason == null ? null : String(parsed.reason);

    if (modelWager != null) {
      return { wager: modelWager, transcript, confidence, reason: reason ?? "ok" };
    }

    const fallback = parseSignedIntFromTranscript(transcript);
    if (fallback != null) {
      return { wager: fallback, transcript, confidence: Math.max(0.5, confidence), reason: "fallback" };
    }

    return { wager: null, transcript, confidence, reason: reason ?? "unreadable" };
  } catch {
    return { wager: null, transcript: "", confidence: 0, reason: "model-error" };
  }
}

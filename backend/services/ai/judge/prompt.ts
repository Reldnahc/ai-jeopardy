import type { AnswerType, JudgeStrictness } from "./types.js";
import { clampLen } from "./normalize.js";

export function buildJudgePrompt(args: {
    transcriptRaw: string;
    expectedRaw: string;
    normT: string;
    normA: string;
    answerType: AnswerType;
    strictness: JudgeStrictness;
}) {
    const { transcriptRaw, expectedRaw, normT, normA, answerType, strictness } = args;

    const strictnessBlock =
        strictness === "lenient"
            ? `
SCORING INTENT:
- Prefer accepting reasonable spoken/typed variants.
- Only mark incorrect if the player's intent is clearly different or too vague.
`.trim()
            : `
SCORING INTENT:
- Prefer correctness over generosity.
- Only accept if it clearly refers to the same specific answer.
- If unsure, return "incorrect".
`.trim();

    return `
You are judging a Jeopardy-style player response.

Return STRICT JSON ONLY:
{ "verdict": "correct" | "incorrect" }

EXPECTED ANSWER TYPE: ${answerType}

ACCEPTANCE RULES:
- Ignore articles ("a", "an", "the"), punctuation, and minor spelling differences.
- Accept acronyms/initialisms/abbreviations if they clearly refer to the same specific answer
  (e.g., "USA" vs "United States of America", "UK" vs "United Kingdom").
- Accept widely-used alternate names if they refer to the same entity (e.g., "Holland" vs "Netherlands" when intended).
- Do NOT require the response to be phrased as a question.
- If expected is a PERSON: accept last name only, or first name omitted (e.g., "Doe" for "Jane Doe") IF it remains unambiguous.
- If expected is a PLACE: accept common short forms (e.g., "NYC" for "New York City") IF it’s the same place.
- If expected is a TITLE: accept dropping leading articles (The/A/An) and minor title variants.
- If expected is a NUMBER/DATE: accept common spoken variants (e.g., "nineteen sixty-nine" for "1969").
- Do NOT accept answers that are merely related, adjacent, or "close".

DISALLOW:
- Do not accept generic responses like "it", "that", "a thing", "someone", etc.
- Do not accept broader categories when a specific answer is required.
- Do not accept partial info that could match many answers.

${strictnessBlock}

Player Input (raw): ${JSON.stringify(clampLen(transcriptRaw, 800))}
Expected Answer (raw): ${JSON.stringify(clampLen(expectedRaw, 800))}
Normalized Player Input: ${JSON.stringify(normT)}
Normalized Expected Answer: ${JSON.stringify(normA)}
`.trim();
}

export function buildImageJudgePrompt(args: {
    expectedRaw: string;
    answerType: AnswerType;
}) {
    const { expectedRaw, answerType } = args;

    return `
You are judging a Final Jeopardy written response from an IMAGE.
First, read the player's text from the image. Then judge correctness.

Return STRICT JSON ONLY:
{ "verdict": "correct" | "incorrect", "transcript": "..." }

EXPECTED ANSWER TYPE: ${answerType}

TRANSCRIPTION RULES:
- If the player's text is unreadable or blank, set transcript to "".

JUDGING RULES:
- Ignore articles ("a", "an", "the"), punctuation, and minor spelling differences.
- Do NOT require phrasing as a question.
- If expected is a PERSON: accept last name only if unambiguous.
- If expected is a NUMBER/DATE: accept common written/spoken variants.
- Do NOT accept "close" or merely related answers.
- If you are unsure, return "incorrect".

Expected Answer (raw): ${JSON.stringify(expectedRaw)}
`.trim();
}

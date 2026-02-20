import type { AnswerType, JudgeStrictness } from "./types.js";
import { clampLen } from "./normalize.js";

export function buildJudgePrompt(args: {
  transcriptRaw: string;
  expectedRaw: string;
  question: string;
  normT: string;
  normA: string;
  answerType: AnswerType;
  strictness: JudgeStrictness;
}) {
  const { transcriptRaw, expectedRaw, question, normT, normA, answerType, strictness } = args;

  const strictnessBlock =
    strictness === "lenient"
      ? `
SCORING INTENT (LENIENT):
- Prefer accepting reasonable spoken/typed variants.
- Use the CLUE/QUESTION context to interpret intent and resolve ambiguity.
- Accept if the response clearly points to the same specific answer *in the context of this clue*,
  even if abbreviated, shortened, or slightly imprecise.
- Only mark incorrect if the response is clearly different, too vague, or plausibly refers to a different answer.
`.trim()
      : `
SCORING INTENT (STRICT):
- Prefer correctness over generosity, but still use CLUE/QUESTION context for interpretation.
- Accept only if it clearly refers to the same specific answer in the context of this clue.
- If ambiguity remains after using the clue context, return "incorrect".
`.trim();

  return `
You are judging a Jeopardy-style player response.

You MUST use the CLUE/QUESTION as context to interpret the player's intent and determine whether a shortened
or alternate form clearly refers to the same specific answer.

Return STRICT JSON ONLY:
{ "verdict": "correct" | "incorrect" }

EXPECTED ANSWER TYPE: ${answerType}

CLUE-AWARE EQUIVALENCE (IMPORTANT):
- The clue/question provides context. If the player's response uniquely matches the intended answer given the clue,
  accept even if it is abbreviated, shortened, or a common alias.
- If the response could reasonably refer to multiple different things *given the clue*, treat it as ambiguous.

ACCEPTANCE RULES:
- Ignore articles ("a", "an", "the"), punctuation, casing, and minor spelling differences.
- Accept acronyms/initialisms/abbreviations if the clue context makes the intended referent clear
  (e.g., "USA" vs "United States of America", "UAE" vs "United Arab Emirates", "WHO" vs "World Health Organization").
- Accept widely-used alternate names / aliases if they refer to the same entity in the clue context
  (e.g., "Holland" vs "Netherlands" when clearly intended by the clue).
- Do NOT require the response to be phrased as a question.
- If expected is a PERSON:
  - Accept last name only, or first name only, IF the clue context makes it unambiguous.
  - If the clue context suggests multiple plausible people with that name, mark incorrect.
- If expected is a PLACE:
  - Accept common short forms and abbreviations IF the clue context makes it the same place.
  - Accept omission of generic geographic feature words when the remaining name still clearly refers to the same place
    in context (e.g., "Sahara" for "Sahara Desert", "Amazon" for "Amazon River").
- If expected is a TITLE:
  - Accept dropping leading articles (The/A/An) and minor title wording variants if the clue context and core title match.
- If expected is a NUMBER/DATE:
  - Accept common spoken/written variants (e.g., "nineteen sixty-nine" for "1969", "July 4th" for "July 4").

DO NOT ACCEPT (even if related):
- Answers that are merely adjacent, in the same category, or “close” but not the same specific answer.
- Broader categories when a specific answer is required by the clue.
- Partial info that could match many answers, unless the clue context makes it uniquely identifying.

VAGUE / GENERIC DISALLOWED:
- Do not accept generic responses like "it", "that", "a thing", "someone", etc.
- Do not accept responses that do not identify an entity/value, or that could fit many different answers.

AMBIGUITY HANDLING:
- Use the clue context first to resolve ambiguity.
- If still ambiguous (plausibly could be something else), verdict depends on strictness:
  - LENIENT: accept only if the player's intent is still clearly pointing to the expected answer; otherwise incorrect.
  - STRICT: incorrect.

${strictnessBlock}

CLUE/QUESTION: ${JSON.stringify(clampLen(question ?? "", 1200))}
Player Input (raw): ${JSON.stringify(clampLen(transcriptRaw, 800))}
Expected Answer (raw): ${JSON.stringify(clampLen(expectedRaw, 800))}
Normalized Player Input: ${JSON.stringify(normT)}
Normalized Expected Answer: ${JSON.stringify(normA)}
`.trim();
}

export function buildImageJudgePrompt(args: { expectedRaw: string; answerType: AnswerType }) {
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

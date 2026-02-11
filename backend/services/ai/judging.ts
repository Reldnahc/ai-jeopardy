import { callOpenAiJson, parseOpenAiJson } from "./openaiClient.js";

export type Verdict = "correct" | "incorrect";

export type JudgeTextResult = { verdict: Verdict };
export type JudgeImageResult = { verdict: Verdict; transcript: string };

function normalizeJeopardyText(s: unknown) {
    return String(s || "")
        .toLowerCase()
        .replace(/^\s*(what|who|where|when)\s+(is|are|was|were)\s+/i, "")
        .replace(/^\s*(it'?s|it is|they are|that'?s|that is)\s+/i, "")
        .replace(/[^a-z0-9\s]/g, " ")
        .replace(/\s+/g, " ")
        .trim();
}

export async function judgeClueAnswerFast(expectedAnswer: string, transcript: string): Promise<string> {
    const normT = normalizeJeopardyText(transcript);
    const normA = normalizeJeopardyText(expectedAnswer);

    if (normT && normA && normT === normA) {
        return "correct";
    }

    const prompt = `
                            You are judging a Jeopardy-style answer.
                            
                            Rules:
                            - Be lenient on articles ("a", "an", "the"), punctuation, minor paraphrases, pluralization, and exact synonyms.
                            - Dont require information that can be inferred. eg. Mario accepted for Super Mario, West Nile accepted for West Nile Virus
                            - Do not require it to be phrased as a question.
                            - If the answer is a name, allow the first name to be omitted.
                            - If the Answer is a name, allow last name only responses.
                            - Example if the answer is "Jane Doe" allow "Doe" as a correct input.
                            - For numbers/dates/names, allow common spoken variants.
                            
                            Return STRICT JSON ONLY:
                            { "verdict": "correct"|"incorrect" }
                            
                            Player Input: ${JSON.stringify(String(transcript || ""))}
                            Expected Answer: ${JSON.stringify(String(expectedAnswer || ""))}
                            
                            Normalized Player Input: ${JSON.stringify(normT)}
                            Normalized Answer: ${JSON.stringify(normA)}
                              `.trim();

    const r = await callOpenAiJson("gpt-4o-mini", prompt, { reasoningEffort: "off" });

    let parsed: any = null;
    try {
        parsed = parseOpenAiJson(r);
    } catch {
        parsed = null;
    }

    const verdict = parsed?.verdict;
    if (verdict !== "correct" && verdict !== "incorrect") {
        return "incorrect" ;
    }

    return  verdict;
}

export async function judgeImage(expectedAnswer: string, imageUrl: string): Promise<JudgeImageResult> {
    const prompt = `
You are judging a final jeopardy clue. Look at the image to see what the player wrote.

Rules:
- Return a transcript of the text, along with a verdict.
- Be lenient on articles ("a", "an", "the"), punctuation, minor paraphrases, pluralization, and exact synonyms.
- They still need to be specific.
- Do not accept close answers.
- Do not require it to be phrased as a question.
- If the answer is a name, allow the first name to be omitted.
- If the Answer is a name, allow last name only responses.
- Example if the answer is "Jane Doe" allow "Doe" as a correct input.
- For numbers/dates/names, allow common spoken variants.

Return STRICT JSON ONLY:
{ "verdict": "correct"|"incorrect", "transcript": "Detected text in image." }

Player Input: See Image
Expected Answer: ${JSON.stringify(String(expectedAnswer || ""))}
  `.trim();

    const r = await callOpenAiJson("gpt-4.1-mini", prompt, { image: imageUrl });

    let parsed: any = null;
    try {
        parsed = parseOpenAiJson(r);
    } catch {
        parsed = null;
    }

    const verdict = parsed?.verdict;
    const transcript = String(parsed?.transcript ?? "");

    if (verdict !== "correct" && verdict !== "incorrect") {
        return { verdict: "incorrect", transcript };
    }

    return { verdict, transcript };
}

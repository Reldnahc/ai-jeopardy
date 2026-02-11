import { callOpenAiJson, parseOpenAiJson } from "../openaiClient.js";
import type { JudgeTextResult, Verdict } from "./types.js";
import { normalizeJeopardyText, hasAnyAlphaNum } from "./normalize.js";
import { inferAnswerType, isTooGeneric, shouldRejectForZeroOverlap } from "./heuristics.js";
import { buildJudgePrompt } from "./prompt.js";
import {appConfig} from "../../../config/appConfig.js";

export async function judgeClueAnswerFast(
    expectedAnswer: string,
    transcript: string
): Promise<JudgeTextResult> {
    const transcriptRaw = String(transcript || "");
    const expectedRaw = String(expectedAnswer || "");

    const normT = normalizeJeopardyText(transcriptRaw);
    const normA = normalizeJeopardyText(expectedRaw);

    // Fast deterministic rejections
    if (!hasAnyAlphaNum(normT) || isTooGeneric(normT)) {
        return { verdict: "incorrect" };
    }

    // Fast deterministic accept
    if (normT && normA && normT === normA) {
        return { verdict: "correct" };
    }

    // Multi-token zero overlap → almost certainly wrong
    if (shouldRejectForZeroOverlap(normA, normT)) {
        return { verdict: "incorrect" };
    }

    const answerType = inferAnswerType(expectedRaw);

    const prompt = buildJudgePrompt({
        transcriptRaw,
        expectedRaw,
        normT,
        normA,
        answerType,
        strictness: "lenient",
    });

    const r = await callOpenAiJson(appConfig.ai.judgeModel, prompt, {
        reasoningEffort: "off",
    });

    let parsed: unknown = null;
    try {
        parsed = parseOpenAiJson(r);
    } catch {
        parsed = null;
    }

    const verdict = (parsed as { verdict?: unknown } | null)?.verdict;

    if (verdict !== "correct" && verdict !== "incorrect") {
        return { verdict: "incorrect" };
    }

    return { verdict: verdict as Verdict };
}

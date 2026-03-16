import { callAiJson, parseAiJson } from "../aiClients/index.js";
import { extractAiUsage } from "../usage.js";
import type { JudgeTextDetailedResult, JudgeTextResult, Verdict } from "./types.js";
import { buildNormalizedAnswerVariants, normalizeJeopardyText } from "./normalize.js";
import { inferAnswerType, isLikelyEquivalentFast, isTooGeneric } from "./heuristics.js";
import { buildJudgePrompt } from "./prompt.js";
import { appConfig } from "../../../config/appConfig.js";

type JudgeJsonCaller = typeof callAiJson;
type JudgeJsonParser = typeof parseAiJson;

function roundTimingMs(ms: number) {
  return Number(ms.toFixed(2));
}

function escapeRegex(text: string) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function isAliasExplicitlyMentionedInQuestion(
  questionRaw: string,
  normTranscript: string,
  normExpected: string,
) {
  if (!normTranscript || !normExpected || normTranscript === normExpected) return false;

  const question = String(questionRaw || "").toLowerCase();
  if (
    !/\b(?:informally called|often called|called|known as|formerly called|formerly known as|once called|also called|aka)\b/.test(
      question,
    )
  ) {
    return false;
  }

  return new RegExp(`\\b${escapeRegex(normTranscript)}\\b`, "i").test(
    normalizeJeopardyText(questionRaw),
  );
}

export async function judgeClueAnswerWithModelDetailed(args: {
  expectedAnswer: string;
  transcript: string;
  question: string;
  category: string;
  model: string;
  callJson?: JudgeJsonCaller;
  parseJson?: JudgeJsonParser;
}): Promise<JudgeTextDetailedResult> {
  const startedAt = performance.now();
  const {
    expectedAnswer,
    transcript,
    question,
    category,
    model,
    callJson = callAiJson,
    parseJson = parseAiJson,
  } = args;

  const transcriptRaw = String(transcript || "");
  const expectedRaw = String(expectedAnswer || "");

  const transcriptVariants = buildNormalizedAnswerVariants(transcriptRaw);
  const normT = transcriptVariants[0] ?? "";
  const normA = normalizeJeopardyText(expectedRaw);

  const finalTranscriptVariant = transcriptVariants[transcriptVariants.length - 1] ?? "";
  if (
    transcriptVariants.length > 1 &&
    finalTranscriptVariant &&
    !isTooGeneric(finalTranscriptVariant) &&
    transcriptVariants.slice(0, -1).some((candidate) => isLikelyEquivalentFast(candidate, normA)) &&
    !isLikelyEquivalentFast(finalTranscriptVariant, normA) &&
    !isAliasExplicitlyMentionedInQuestion(question, finalTranscriptVariant, normA)
  ) {
    return {
      verdict: "incorrect",
      diagnostics: {
        path: "generic_reject",
        model: null,
        total_ms: roundTimingMs(performance.now() - startedAt),
        model_ms: null,
        usage: null,
        parser_failed: false,
      },
    };
  }

  // Fast deterministic accept for exact/normalized matches, spoken artifacts, and aliases named in the clue.
  if (
    transcriptVariants.some(
      (candidate) =>
        isLikelyEquivalentFast(candidate, normA) ||
        isAliasExplicitlyMentionedInQuestion(question, candidate, normA),
    )
  ) {
    return {
      verdict: "correct",
      diagnostics: {
        path: "fast_accept",
        model: null,
        total_ms: roundTimingMs(performance.now() - startedAt),
        model_ms: null,
        usage: null,
        parser_failed: false,
      },
    };
  }

  const tGeneric = transcriptVariants.every((candidate) => isTooGeneric(candidate));
  const aGeneric = isTooGeneric(normA);

  // only reject generic transcript if expected isn't also generic/short
  if (tGeneric && !aGeneric) {
    return {
      verdict: "incorrect",
      diagnostics: {
        path: "generic_reject",
        model: null,
        total_ms: roundTimingMs(performance.now() - startedAt),
        model_ms: null,
        usage: null,
        parser_failed: false,
      },
    };
  }

  const answerType = inferAnswerType(expectedRaw);

  const prompt = buildJudgePrompt({
    transcriptRaw,
    expectedRaw,
    question,
    category,
    normT,
    normA,
    answerType,
    strictness: "lenient",
  });

  const modelStartedAt = performance.now();
  const r = await callJson(model, prompt, {
    reasoningEffort: "off",
  });
  const modelMs = roundTimingMs(performance.now() - modelStartedAt);
  const usage = extractAiUsage(r, model);

  let parsed: unknown = null;
  let parserFailed = false;
  try {
    parsed = parseJson(r);
  } catch {
    parsed = null;
    parserFailed = true;
  }

  const verdict = (parsed as { verdict?: unknown } | null)?.verdict;

  if (verdict !== "correct" && verdict !== "incorrect") {
    return {
      verdict: "incorrect",
      diagnostics: {
        path: "model",
        model,
        total_ms: roundTimingMs(performance.now() - startedAt),
        model_ms: modelMs,
        usage,
        parser_failed: parserFailed,
      },
    };
  }

  return {
    verdict: verdict as Verdict,
    diagnostics: {
      path: "model",
      model,
      total_ms: roundTimingMs(performance.now() - startedAt),
      model_ms: modelMs,
      usage,
      parser_failed: parserFailed,
    },
  };
}

export async function judgeClueAnswerWithModel(args: {
  expectedAnswer: string;
  transcript: string;
  question: string;
  category: string;
  model: string;
  callJson?: JudgeJsonCaller;
  parseJson?: JudgeJsonParser;
}): Promise<JudgeTextResult> {
  const result = await judgeClueAnswerWithModelDetailed(args);
  return { verdict: result.verdict };
}

export async function judgeClueAnswerFast(
  expectedAnswer: string,
  transcript: string,
  question: string,
  category: string,
): Promise<JudgeTextResult> {
  return judgeClueAnswerWithModel({
    expectedAnswer,
    transcript,
    question,
    category,
    model: appConfig.ai.judgeModel,
  });
}

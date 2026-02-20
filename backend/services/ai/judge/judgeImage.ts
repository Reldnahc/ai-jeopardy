import { callOpenAiJson, parseOpenAiJson } from "../openaiClient.js";
import type { JudgeImageResult } from "./types.js";
import { normalizeJeopardyText, hasAnyAlphaNum } from "./normalize.js";
import { inferAnswerType, isTooGeneric } from "./heuristics.js";
import { buildImageJudgePrompt } from "./prompt.js";
import { appConfig } from "../../../config/appConfig.js";

export async function judgeImage(
  expectedAnswer: string,
  imageUrl: string,
): Promise<JudgeImageResult> {
  const expectedRaw = String(expectedAnswer || "");
  const answerType = inferAnswerType(expectedRaw);

  const prompt = buildImageJudgePrompt({
    expectedRaw,
    answerType,
  });

  const r = await callOpenAiJson(appConfig.ai.imageJudgeModel, prompt, {
    image: imageUrl,
  });

  let parsed: unknown = null;
  try {
    parsed = parseOpenAiJson(r);
  } catch {
    parsed = null;
  }

  const verdict = (parsed as { verdict?: unknown } | null)?.verdict;
  const transcript = String((parsed as { transcript?: unknown } | null)?.transcript ?? "");

  const normTranscript = normalizeJeopardyText(transcript);

  if (!hasAnyAlphaNum(normTranscript) || isTooGeneric(normTranscript)) {
    return { verdict: "incorrect", transcript };
  }

  if (verdict !== "correct" && verdict !== "incorrect") {
    return { verdict: "incorrect", transcript };
  }

  return { verdict, transcript };
}

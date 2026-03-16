// backend/services/ai/boardGenerate.ts
import type { ReasoningEffort } from "./boardPrompts.js";
import type { AiCategoryJson, AiFinalCategoryJson } from "./boardSchemas.js";
import { isAiCategoryJson, isAiFinalCategoryJson } from "./boardSchemas.js";

export type CallOpenAiJson = (
  model: string,
  prompt: string,
  opts: { reasoningEffort?: ReasoningEffort },
) => Promise<unknown>;

export type ParseOpenAiJson = <T>(raw: unknown) => T;
export type CallAiJson = CallOpenAiJson;
export type ParseAiJson = ParseOpenAiJson;

export async function generateAiCategoryJson(args: {
  callAiJson: CallAiJson;
  parseAiJson: ParseAiJson;
  model: string;
  prompt: string;
  reasoningEffort?: ReasoningEffort;
  errorLabel: string;
}): Promise<AiCategoryJson> {
  const { callAiJson, parseAiJson, model, prompt, reasoningEffort, errorLabel } = args;

  const raw = await callAiJson(model, prompt, { reasoningEffort });
  const ai = parseAiJson<unknown>(raw);

  if (!isAiCategoryJson(ai)) {
    throw new Error(`${errorLabel} missing required fields`);
  }

  return ai;
}

export async function generateAiFinalCategoryJson(args: {
  callAiJson: CallAiJson;
  parseAiJson: ParseAiJson;
  model: string;
  prompt: string;
  reasoningEffort?: ReasoningEffort;
  errorLabel: string;
}): Promise<AiFinalCategoryJson> {
  const { callAiJson, parseAiJson, model, prompt, reasoningEffort, errorLabel } = args;

  const raw = await callAiJson(model, prompt, { reasoningEffort });
  const ai = parseAiJson<unknown>(raw);

  if (!isAiFinalCategoryJson(ai)) {
    throw new Error(`${errorLabel} missing required fields`);
  }

  return ai;
}

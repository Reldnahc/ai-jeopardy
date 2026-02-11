// backend/services/ai/boardGenerate.ts
import type { ReasoningEffort } from "./boardPrompts.js";
import type { AiCategoryJson, AiFinalCategoryJson } from "./boardSchemas.js";
import { isAiCategoryJson, isAiFinalCategoryJson } from "./boardSchemas.js";

export type CallOpenAiJson = (
    model: string,
    prompt: string,
    opts: { reasoningEffort?: ReasoningEffort }
) => Promise<unknown>;

export type ParseOpenAiJson = <T>(raw: unknown) => T;

export async function generateAiCategoryJson(args: {
    callOpenAiJson: CallOpenAiJson;
    parseOpenAiJson: ParseOpenAiJson;
    model: string;
    prompt: string;
    reasoningEffort?: ReasoningEffort;
    errorLabel: string;
}): Promise<AiCategoryJson> {
    const { callOpenAiJson, parseOpenAiJson, model, prompt, reasoningEffort, errorLabel } = args;

    const raw = await callOpenAiJson(model, prompt, { reasoningEffort });
    const ai = parseOpenAiJson<unknown>(raw);

    if (!isAiCategoryJson(ai)) {
        throw new Error(`${errorLabel} missing required fields`);
    }

    return ai;
}

export async function generateAiFinalCategoryJson(args: {
    callOpenAiJson: CallOpenAiJson;
    parseOpenAiJson: ParseOpenAiJson;
    model: string;
    prompt: string;
    reasoningEffort?: ReasoningEffort;
    errorLabel: string;
}): Promise<AiFinalCategoryJson> {
    const { callOpenAiJson, parseOpenAiJson, model, prompt, reasoningEffort, errorLabel } = args;

    const raw = await callOpenAiJson(model, prompt, { reasoningEffort });
    const ai = parseOpenAiJson<unknown>(raw);

    if (!isAiFinalCategoryJson(ai)) {
        throw new Error(`${errorLabel} missing required fields`);
    }

    return ai;
}

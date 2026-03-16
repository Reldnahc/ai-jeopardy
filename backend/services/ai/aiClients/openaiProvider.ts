import OpenAI from "openai";

import { env } from "../../../config/env.js";
import { callOpenAiCompatibleJson, modelSupportsReasoningEffort } from "./openAiCompatible.js";
import { DEFAULT_JSON_SYSTEM_PROMPT, type AiCallOptions } from "./types.js";

const openai = new OpenAI({ apiKey: env.OPENAI_API_KEY });

export async function callOpenAiJson(model: string, prompt: string, options: AiCallOptions) {
  const client = options.apiKeyOverride ? new OpenAI({ apiKey: options.apiKeyOverride }) : openai;
  const normalizedOptions = {
    ...options,
    systemPrompt: String(options.systemPrompt ?? DEFAULT_JSON_SYSTEM_PROMPT).trim(),
  };

  return callOpenAiCompatibleJson({
    client,
    model,
    prompt,
    options: normalizedOptions,
    supportsReasoningEffort: modelSupportsReasoningEffort(model),
  });
}

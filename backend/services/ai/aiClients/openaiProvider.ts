import OpenAI from "openai";

import { env } from "../../../config/env.js";
import { callOpenAiCompatibleJson, modelSupportsReasoningEffort } from "./openAiCompatible.js";
import { DEFAULT_JSON_SYSTEM_PROMPT, type AiCallOptions } from "./types.js";

function buildOpenAiClient(apiKey: string) {
  return new OpenAI({
    apiKey,
    ...(env.OPENAI_BASE_URL ? { baseURL: env.OPENAI_BASE_URL } : {}),
  });
}

const openai = buildOpenAiClient(env.OPENAI_API_KEY);

export async function callOpenAiJson(model: string, prompt: string, options: AiCallOptions) {
  const client = options.apiKeyOverride ? buildOpenAiClient(options.apiKeyOverride) : openai;
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

import OpenAI from "openai";

import { env } from "../../../config/env.js";
import { callOpenAiCompatibleJson } from "./openAiCompatible.js";
import { DEFAULT_JSON_SYSTEM_PROMPT, type AiCallOptions } from "./types.js";

const deepseek = env.DEEPSEEK_API_KEY
  ? new OpenAI({
      apiKey: env.DEEPSEEK_API_KEY,
      baseURL: env.DEEPSEEK_BASE_URL,
    })
  : null;

export async function callDeepSeekJson(model: string, prompt: string, options: AiCallOptions) {
  if (options.image) {
    throw new Error("DeepSeek image JSON calls are not implemented in this client.");
  }

  const apiKey = options.apiKeyOverride || env.DEEPSEEK_API_KEY;
  if (!apiKey) {
    throw new Error("DEEPSEEK_API_KEY is required for DeepSeek models.");
  }

  const client =
    options.apiKeyOverride || !deepseek
      ? new OpenAI({ apiKey, baseURL: env.DEEPSEEK_BASE_URL })
      : deepseek;
  const normalizedOptions = {
    ...options,
    systemPrompt: String(options.systemPrompt ?? DEFAULT_JSON_SYSTEM_PROMPT).trim(),
  };

  return callOpenAiCompatibleJson({
    client,
    model,
    prompt,
    options: normalizedOptions,
    supportsReasoningEffort: false,
  });
}

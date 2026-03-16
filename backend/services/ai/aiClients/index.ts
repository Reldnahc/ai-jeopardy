import type { Provider } from "../../../../shared/models.js";

import { callAnthropicJson } from "./anthropicProvider.js";
import { parseAiJson } from "./json.js";
import { callDeepSeekJson } from "./deepseekProvider.js";
import { callOpenAiJson } from "./openaiProvider.js";
import { resolveProviderForModel } from "./providerResolver.js";
import { DEFAULT_JSON_SYSTEM_PROMPT, type AiCallOptions, type ReasoningEffort } from "./types.js";

export { parseAiJson, resolveProviderForModel, DEFAULT_JSON_SYSTEM_PROMPT };
export type { AiCallOptions, ReasoningEffort, Provider };

export async function callAiJson(model: string, prompt: string, options: AiCallOptions = {}) {
  const provider = resolveProviderForModel(model, options.providerOverride);
  const normalizedOptions = {
    ...options,
    systemPrompt: String(options.systemPrompt ?? DEFAULT_JSON_SYSTEM_PROMPT).trim(),
  };

  if (provider === "anthropic") {
    return callAnthropicJson(model, prompt, normalizedOptions);
  }
  if (provider === "deepseek") {
    return callDeepSeekJson(model, prompt, normalizedOptions);
  }
  return callOpenAiJson(model, prompt, normalizedOptions);
}

import Anthropic from "@anthropic-ai/sdk";

import { env } from "../../../config/env.js";
import { DEFAULT_JSON_SYSTEM_PROMPT, type AiCallOptions } from "./types.js";

export async function callAnthropicJson(model: string, prompt: string, options: AiCallOptions) {
  if (options.image) {
    throw new Error("Anthropic image JSON calls are not implemented in this client.");
  }

  const apiKey = options.apiKeyOverride || env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error("ANTHROPIC_API_KEY is required for Anthropic models.");
  }

  const client = new Anthropic({ apiKey });
  const systemPrompt = String(options.systemPrompt ?? DEFAULT_JSON_SYSTEM_PROMPT).trim();
  return client.messages.create({
    model,
    max_tokens: 4000,
    system: systemPrompt,
    messages: [{ role: "user", content: prompt }],
  });
}

import OpenAI from "openai";

import { modelsByValue } from "../../../../shared/models.js";
import type { AiCallOptions } from "./types.js";

type ChatCreateParams = Parameters<OpenAI["chat"]["completions"]["create"]>[0];

export async function callOpenAiCompatibleJson(args: {
  client: OpenAI;
  model: string;
  prompt: string;
  options: AiCallOptions;
  supportsReasoningEffort: boolean;
}) {
  const { client, model, prompt, options, supportsReasoningEffort } = args;
  const effort = options.reasoningEffort;

  const includeReasoningEffort =
    supportsReasoningEffort && (effort === "low" || effort === "medium" || effort === "high");

  const content = options.image
    ? [
        { type: "text", text: prompt },
        { type: "image_url", image_url: { url: options.image } },
      ]
    : prompt;

  const payload = {
    model,
    messages: [
      { role: "system" as const, content: options.systemPrompt! },
      { role: "user" as const, content },
    ],
    response_format: { type: "json_object" as const },
  };

  if (includeReasoningEffort) {
    return client.chat.completions.create({
      ...payload,
      reasoning_effort: effort,
    } as unknown as ChatCreateParams);
  }

  return client.chat.completions.create(payload as ChatCreateParams);
}

export function modelSupportsReasoningEffort(model: string) {
  return modelsByValue[model]?.supportsReasoningEffort === true;
}

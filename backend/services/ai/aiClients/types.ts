import type { Provider } from "../../../../shared/models.js";

export type ReasoningEffort = "off" | "low" | "medium" | "high";

export type AiCallOptions = {
  reasoningEffort?: ReasoningEffort;
  image?: string;
  systemPrompt?: string;
  providerOverride?: Provider;
  apiKeyOverride?: string;
};

export const DEFAULT_JSON_SYSTEM_PROMPT = "Return only valid JSON. No markdown.";

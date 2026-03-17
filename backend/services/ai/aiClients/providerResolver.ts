import { modelsByValue, type Provider } from "../../../../shared/models.js";

function inferProviderFromModel(model: string): Provider {
  const normalized = String(model ?? "")
    .trim()
    .toLowerCase();
  if (normalized.startsWith("claude-")) return "anthropic";
  if (normalized.startsWith("deepseek-")) return "deepseek";
  if (normalized.startsWith("gemini-")) return "gemini";
  if (
    normalized.startsWith("gpt-") ||
    normalized.startsWith("o1") ||
    normalized.startsWith("o3") ||
    normalized.startsWith("o4")
  ) {
    return "openai";
  }
  throw new Error(`Unable to infer provider for model: ${model}`);
}

export function resolveProviderForModel(model: string, providerOverride?: Provider): Provider {
  if (providerOverride) return providerOverride;
  return modelsByValue[model]?.provider ?? inferProviderFromModel(model);
}

import { getModelPricingUsdPer1M } from "../../../shared/models.js";
import { resolveProviderForModel } from "./aiClients/index.js";

export type AiUsage = {
  prompt_tokens: number | null;
  completion_tokens: number | null;
  total_tokens: number | null;
  reasoning_tokens: number | null;
  cost_usd: number | null;
};

function safeNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function firstNumber(...values: unknown[]) {
  for (const value of values) {
    const normalized = safeNumber(value);
    if (normalized != null) return normalized;
  }
  return null;
}

function estimateRequestCostUsd(args: {
  model: string;
  promptTokens: number | null;
  completionTokens: number | null;
  reasoningTokens: number | null;
}) {
  const pricing = getModelPricingUsdPer1M(args.model);
  if (!pricing) return null;

  const promptCost = ((args.promptTokens ?? 0) / 1_000_000) * pricing.inputPer1M;
  const completionCost = ((args.completionTokens ?? 0) / 1_000_000) * pricing.outputPer1M;
  const reasoningCost =
    pricing.reasoningPer1M != null
      ? ((args.reasoningTokens ?? 0) / 1_000_000) * pricing.reasoningPer1M
      : 0;

  return Number((promptCost + completionCost + reasoningCost).toFixed(8));
}

function extractOpenAiCompatibleUsage(response: unknown, model: string): AiUsage {
  const root = response as {
    usage?: {
      prompt_tokens?: unknown;
      completion_tokens?: unknown;
      input_tokens?: unknown;
      output_tokens?: unknown;
      total_tokens?: unknown;
      completion_tokens_details?: { reasoning_tokens?: unknown };
      output_tokens_details?: { reasoning_tokens?: unknown };
    };
  };
  const promptTokens = firstNumber(root.usage?.input_tokens, root.usage?.prompt_tokens);
  const completionTokens = firstNumber(root.usage?.output_tokens, root.usage?.completion_tokens);
  const totalTokens = safeNumber(root.usage?.total_tokens);
  const reasoningTokens = firstNumber(
    root.usage?.output_tokens_details?.reasoning_tokens,
    root.usage?.completion_tokens_details?.reasoning_tokens,
  );

  return {
    prompt_tokens: promptTokens,
    completion_tokens: completionTokens,
    total_tokens: totalTokens,
    reasoning_tokens: reasoningTokens,
    cost_usd: estimateRequestCostUsd({
      model,
      promptTokens,
      completionTokens,
      reasoningTokens,
    }),
  };
}

export function extractGeminiUsage(response: unknown, model: string): AiUsage {
  const root = response as {
    usageMetadata?: {
      promptTokenCount?: unknown;
      candidatesTokenCount?: unknown;
      totalTokenCount?: unknown;
      thoughtsTokenCount?: unknown;
    };
  };
  const promptTokens = safeNumber(root.usageMetadata?.promptTokenCount);
  const completionTokens = safeNumber(root.usageMetadata?.candidatesTokenCount);
  const totalTokens = safeNumber(root.usageMetadata?.totalTokenCount);
  const reasoningTokens = safeNumber(root.usageMetadata?.thoughtsTokenCount);

  return {
    prompt_tokens: promptTokens,
    completion_tokens: completionTokens,
    total_tokens: totalTokens,
    reasoning_tokens: reasoningTokens,
    cost_usd: estimateRequestCostUsd({
      model,
      promptTokens,
      completionTokens,
      reasoningTokens,
    }),
  };
}

function extractAnthropicUsage(response: unknown, model: string): AiUsage {
  const root = response as {
    usage?: {
      input_tokens?: unknown;
      output_tokens?: unknown;
      cache_creation_input_tokens?: unknown;
      cache_read_input_tokens?: unknown;
    };
  };
  const promptTokens =
    (safeNumber(root.usage?.input_tokens) ?? 0) +
    (safeNumber(root.usage?.cache_creation_input_tokens) ?? 0) +
    (safeNumber(root.usage?.cache_read_input_tokens) ?? 0);
  const completionTokens = safeNumber(root.usage?.output_tokens);
  const totalTokens = promptTokens + (completionTokens ?? 0);

  return {
    prompt_tokens: promptTokens,
    completion_tokens: completionTokens,
    total_tokens: totalTokens,
    reasoning_tokens: null,
    cost_usd: estimateRequestCostUsd({
      model,
      promptTokens,
      completionTokens,
      reasoningTokens: null,
    }),
  };
}

export function extractAiUsage(response: unknown, model: string): AiUsage {
  const provider = resolveProviderForModel(model);
  if (provider === "anthropic") {
    return extractAnthropicUsage(response, model);
  }

  if (provider === "gemini") {
    return extractGeminiUsage(response, model);
  }

  return extractOpenAiCompatibleUsage(response, model);
}

export function summarizeAiUsage(usages: Array<AiUsage | null | undefined>) {
  let promptTokens = 0;
  let completionTokens = 0;
  let totalTokens = 0;
  let reasoningTokens = 0;
  let requestsWithUsage = 0;
  let requestsMissingUsage = 0;
  let costKnown = true;
  let costUsd = 0;

  for (const usage of usages) {
    const hasUsage =
      usage?.prompt_tokens != null ||
      usage?.completion_tokens != null ||
      usage?.total_tokens != null ||
      usage?.reasoning_tokens != null;

    if (!hasUsage || !usage) {
      requestsMissingUsage += 1;
      continue;
    }

    requestsWithUsage += 1;
    promptTokens += usage.prompt_tokens ?? 0;
    completionTokens += usage.completion_tokens ?? 0;
    totalTokens +=
      usage.total_tokens ?? (usage.prompt_tokens ?? 0) + (usage.completion_tokens ?? 0);
    reasoningTokens += usage.reasoning_tokens ?? 0;

    if (usage.cost_usd == null) {
      costKnown = false;
    } else {
      costUsd += usage.cost_usd;
    }
  }

  return {
    prompt_tokens: promptTokens,
    completion_tokens: completionTokens,
    total_tokens: totalTokens,
    reasoning_tokens: reasoningTokens,
    requests_with_usage: requestsWithUsage,
    requests_missing_usage: requestsMissingUsage,
    average_tokens_per_request:
      requestsWithUsage > 0 ? Number((totalTokens / requestsWithUsage).toFixed(2)) : null,
    cost_usd: costKnown ? Number(costUsd.toFixed(8)) : null,
  };
}

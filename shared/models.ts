export type Provider = "openai" | "anthropic" | "deepseek" | "gemini";

export type Model = {
  value: string;
  label: string;
  provider?: Provider;
  supportsReasoningEffort?: boolean;
  pricingUsdPer1M?: {
    input: number;
    output: number;
    reasoning?: number;
  };
  strengths: string[];
  bestFor: string;
  availabilityNote?: string;
  price: number;
  disabled?: boolean;
};

export type ModelAvailability = {
  hasAnthropicApiKey?: boolean;
  hasDeepSeekApiKey?: boolean;
  hasGeminiApiKey?: boolean;
};

export const models: Model[] = [
  {
    value: "gpt-4o-mini",
    label: "GPT-4o Mini",
    provider: "openai",
    pricingUsdPer1M: { input: 0.15, output: 0.6 },
    strengths: ["Reliable all-around results", "Clear concise writing", "Consistent behavior"],
    bestFor: "A dependable everyday choice for most games",
    price: 0,
  },
  {
    value: "gpt-5.2",
    label: "GPT-5.2",
    provider: "openai",
    supportsReasoningEffort: true,
    pricingUsdPer1M: { input: 1.75, output: 14 },
    strengths: ["Strong reasoning", "High-quality answers", "Excellent at complex prompts"],
    bestFor: "Hard clue writing, careful judging, and polished game content",
    availabilityNote: "Currently reserved for special use, not regular lobbies.",
    price: 100,
  },
  {
    value: "gpt-5-mini",
    label: "GPT-5 Mini",
    provider: "openai",
    supportsReasoningEffort: true,
    pricingUsdPer1M: { input: 0.25, output: 2 },
    strengths: ["Balanced speed and quality", "Follows directions well", "Consistent results"],
    bestFor: "A strong default for most games and lobby setups",
    price: 100,
  },
  {
    value: "gpt-5-nano",
    label: "GPT-5 Nano",
    provider: "openai",
    pricingUsdPer1M: { input: 0.05, output: 0.4 },
    strengths: ["Very fast replies", "Good for lightweight tasks", "Low-latency interaction"],
    bestFor: "Simple prompts, quick retries, and speed-first runs",
    price: 100,
  },
  {
    value: "gpt-4.1-nano",
    label: "GPT-4.1 Nano",
    provider: "openai",
    pricingUsdPer1M: { input: 0.1, output: 0.4 },
    strengths: ["Fast turnaround", "Good for simple text tasks", "Useful baseline output"],
    bestFor: "Short prompts and quick utility generation",
    price: 100,
  },
  {
    value: "gpt-4o",
    label: "GPT-4o",
    provider: "openai",
    pricingUsdPer1M: { input: 2.5, output: 10 },
    strengths: ["High-quality output", "Broad capability", "Strong instruction following"],
    bestFor: "Richer category writing and more polished content",
    availabilityNote: "Currently reserved for special use, not regular lobbies.",
    price: 100,
  },
  {
    value: "o1-mini",
    label: "o1 Mini",
    provider: "openai",
    pricingUsdPer1M: { input: 1.1, output: 4.4 },
    strengths: ["Careful step-by-step thinking", "Good logic handling", "Strong on tricky edge cases"],
    bestFor: "Reasoning-heavy tasks and tougher clue validation",
    availabilityNote: "Currently reserved for special use, not regular lobbies.",
    price: 100,
  },
  {
    value: "claude-sonnet-4-6",
    label: "Claude Sonnet 4.6",
    provider: "anthropic",
    pricingUsdPer1M: { input: 3, output: 15 },
    strengths: ["Strong writing quality", "Follows directions well", "Thoughtful long-form output"],
    bestFor: "High-quality board writing when you want a Claude option",
    price: 100,
  },
  {
    value: "claude-haiku-4-5",
    label: "Claude Haiku 4.5",
    provider: "anthropic",
    pricingUsdPer1M: { input: 1, output: 5 },
    strengths: ["Fast turnaround", "Lower-cost runs", "Useful comparison baseline"],
    bestFor: "High-volume testing and speed-oriented generation",
    price: 100,
  },
  {
    value: "deepseek-chat",
    label: "DeepSeek Chat",
    provider: "deepseek",
    pricingUsdPer1M: { input: 0.28, output: 0.42 },
    strengths: ["Low-cost generation", "High throughput", "Good structured output"],
    bestFor: "Fast, inexpensive board generation and bulk runs",
    price: 0,
  },
  {
    value: "deepseek-reasoner",
    label: "DeepSeek Reasoner",
    provider: "deepseek",
    pricingUsdPer1M: { input: 0.28, output: 0.42 },
    strengths: ["Deliberate reasoning", "Step-by-step problem solving", "Handles more complex prompts"],
    bestFor: "More careful clue writing and evaluation with DeepSeek",
    price: 100,
  },
  {
    value: "gemini-2.5-flash",
    label: "Gemini 2.5 Flash",
    provider: "gemini",
    pricingUsdPer1M: { input: 0.3, output: 2.5 },
    strengths: ["Fast multimodal generation", "Strong structured output", "Stable general-purpose Gemini"],
    bestFor: "Fast board generation and general-purpose Gemini runs",
    price: 0,
  },
  {
    value: "gemini-2.5-flash-lite",
    label: "Gemini 2.5 Flash-Lite",
    provider: "gemini",
    pricingUsdPer1M: { input: 0.1, output: 0.4 },
    strengths: ["Lowest Gemini cost", "High throughput", "Good for bulk generation"],
    bestFor: "Cheap high-volume board generation and batch-style runs",
    price: 0,
  },
  {
    value: "gemini-2.5-pro",
    label: "Gemini 2.5 Pro",
    provider: "gemini",
    pricingUsdPer1M: { input: 1.25, output: 10 },
    strengths: ["Stronger reasoning", "Higher-quality drafting", "Stable advanced Gemini model"],
    bestFor: "More demanding clue writing, judging, and multimodal prompts",
    price: 100,
  },
];

export function getAvailableModels(availability: ModelAvailability = {}): Model[] {
  return models.filter((model) => {
    if (model.provider === "anthropic") {
      return availability.hasAnthropicApiKey === true;
    }

    if (model.provider === "deepseek") {
      return availability.hasDeepSeekApiKey === true;
    }

    if (model.provider === "gemini") {
      return availability.hasGeminiApiKey === true;
    }

    return true;
  });
}

export function createModelsByValue(sourceModels: Model[] = models): Record<string, Model> {
  return Object.fromEntries(sourceModels.map((model) => [model.value, model]));
}

export const modelsByValue = createModelsByValue(models);

export function getModelPricingUsdPer1M(model: string) {
  const pricing = modelsByValue[model]?.pricingUsdPer1M;
  if (!pricing) return null;

  return {
    inputPer1M: pricing.input,
    outputPer1M: pricing.output,
    reasoningPer1M: pricing.reasoning,
  };
}

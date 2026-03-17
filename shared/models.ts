export type Provider = "openai" | "anthropic" | "deepseek";

export type Model = {
  value: string;
  label: string;
  provider?: Provider;
  supportsReasoningEffort?: boolean;
  strengths: string[];
  bestFor: string;
  availabilityNote?: string;
  price: number;
  disabled?: boolean;
};

export type ModelAvailability = {
  hasAnthropicApiKey?: boolean;
  hasDeepSeekApiKey?: boolean;
};

export const models: Model[] = [
  {
    value: "gpt-4o-mini",
    label: "GPT-4o Mini",
    provider: "openai",
    strengths: ["Reliable all-around results", "Clear concise writing", "Consistent behavior"],
    bestFor: "A dependable everyday choice for most games",
    price: 0,
  },
  {
    value: "gpt-5.2",
    label: "GPT-5.2",
    provider: "openai",
    supportsReasoningEffort: true,
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
    strengths: ["Balanced speed and quality", "Follows directions well", "Consistent results"],
    bestFor: "A strong default for most games and lobby setups",
    price: 100,
  },
  {
    value: "gpt-5-nano",
    label: "GPT-5 Nano",
    provider: "openai",
    strengths: ["Very fast replies", "Good for lightweight tasks", "Low-latency interaction"],
    bestFor: "Simple prompts, quick retries, and speed-first runs",
    price: 100,
  },
  {
    value: "gpt-4.1-nano",
    label: "GPT-4.1 Nano",
    provider: "openai",
    strengths: ["Fast turnaround", "Good for simple text tasks", "Useful baseline output"],
    bestFor: "Short prompts and quick utility generation",
    price: 100,
  },
  {
    value: "gpt-4o",
    label: "GPT-4o",
    provider: "openai",
    strengths: ["High-quality output", "Broad capability", "Strong instruction following"],
    bestFor: "Richer category writing and more polished content",
    availabilityNote: "Currently reserved for special use, not regular lobbies.",
    price: 100,
  },
  {
    value: "o1-mini",
    label: "o1 Mini",
    provider: "openai",
    strengths: ["Careful step-by-step thinking", "Good logic handling", "Strong on tricky edge cases"],
    bestFor: "Reasoning-heavy tasks and tougher clue validation",
    availabilityNote: "Currently reserved for special use, not regular lobbies.",
    price: 100,
  },
  {
    value: "claude-sonnet-4-6",
    label: "Claude Sonnet 4.6",
    provider: "anthropic",
    strengths: ["Strong writing quality", "Follows directions well", "Thoughtful long-form output"],
    bestFor: "High-quality board writing when you want a Claude option",
    price: 100,
  },
  {
    value: "claude-haiku-4-5",
    label: "Claude Haiku 4.5",
    provider: "anthropic",
    strengths: ["Fast turnaround", "Lower-cost runs", "Useful comparison baseline"],
    bestFor: "High-volume testing and speed-oriented generation",
    price: 100,
  },
  {
    value: "deepseek-chat",
    label: "DeepSeek Chat",
    provider: "deepseek",
    strengths: ["Low-cost generation", "High throughput", "Good structured output"],
    bestFor: "Fast, inexpensive board generation and bulk runs",
    price: 0,
  },
  {
    value: "deepseek-reasoner",
    label: "DeepSeek Reasoner",
    provider: "deepseek",
    strengths: ["Deliberate reasoning", "Step-by-step problem solving", "Handles more complex prompts"],
    bestFor: "More careful clue writing and evaluation with DeepSeek",
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

    return true;
  });
}

export function createModelsByValue(sourceModels: Model[] = models): Record<string, Model> {
  return Object.fromEntries(sourceModels.map((model) => [model.value, model]));
}

export const modelsByValue = createModelsByValue(models);

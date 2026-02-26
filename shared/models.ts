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

export const models: Model[] = [
  {
    value: "gpt-4o-mini",
    label: "GPT-4o Mini",
    provider: "openai",
    strengths: ["Stable general performance", "Good concise writing", "Predictable behavior"],
    bestFor: "Everyday generation when you want dependable outputs",
    price: 0,
  },
  {
    value: "gpt-5.2",
    label: "GPT-5.2",
    provider: "openai",
    supportsReasoningEffort: true,
    strengths: ["Deep reasoning", "High answer quality", "Reliable complex synthesis"],
    bestFor: "Hard clue writing, nuanced judging, and polished game content",
    availabilityNote: "Not currently enabled in normal lobbies due to pricing constraints.",
    price: 100,
  },
  {
    value: "gpt-5-mini",
    label: "GPT-5 Mini",
    provider: "openai",
    supportsReasoningEffort: true,
    strengths: ["Balanced quality", "Strong instruction following", "Consistent output"],
    bestFor: "Default all-around model for most games and lobby setups",
    price: 0,
  },
  {
    value: "gpt-5-nano",
    label: "GPT-5 Nano",
    provider: "openai",
    strengths: ["Fast responses", "Lightweight tasks", "Low-latency interactions"],
    bestFor: "Simple prompts, quick retries, and speed-first workflows",
    price: 0,
  },
  {
    value: "gpt-4.1-nano",
    label: "GPT-4.1 Nano",
    provider: "openai",
    strengths: [
      "Very fast turnaround",
      "Low-complexity text tasks",
      "Efficient baseline generation",
    ],
    bestFor: "Short-form prompts and quick utility generation",
    price: 0,
  },
  {
    value: "gpt-4o",
    label: "GPT-4o",
    provider: "openai",
    strengths: ["High quality generation", "Broad capability", "Strong instruction adherence"],
    bestFor: "Richer category writing and high-fidelity content generation",
    availabilityNote: "Not currently enabled in normal lobbies due to pricing constraints.",
    price: 100,
  },
  {
    value: "o1-mini",
    label: "o1 Mini",
    provider: "openai",
    strengths: ["Stepwise reasoning", "Careful logic handling", "Good for tricky edge cases"],
    bestFor: "Reasoning-heavy tasks and challenging clue validation",
    availabilityNote: "Not currently enabled in normal lobbies due to pricing constraints.",
    price: 100,
  },
];

export const modelsByValue = Object.fromEntries(models.map((m) => [m.value, m]));

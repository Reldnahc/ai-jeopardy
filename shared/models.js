export const models = [
    {
        value: "gpt-5.2",
        label: "GPT-5.2",
        provider: "openai",
        supportsReasoningEffort: true,
        price: 100,
    },
    {
        value: "gpt-5-mini",
        label: "GPT-5 Mini",
        provider: "openai",
        supportsReasoningEffort: true,
        price: 0,
    },
    {
        value: "gpt-5-nano",
        label: "GPT-5 Nano",
        provider: "openai",
        price: 0,
    },
    {
        value: "gpt-4o-mini",
        label: "GPT-4o Mini",
        provider: "openai",
        price: 0,
    },
    {
        value: "gpt-4.1-nano",
        label: "GPT-4.1 Nano",
        provider: "openai",
        price: 0,
    },
    {
        value: "gpt-4o",
        label: "GPT-4o",
        provider: "openai",
        price: 100,
    },
    {
        value: "o1-mini",
        label: "o1 Mini",
        provider: "openai",
        price: 100,
    },
    {
        value: "claude-3-5-sonnet-latest",
        label: "Claude 3.5 Sonnet",
        provider: "anthropic",
        price: 100,
    },
    {
        value: "claude-3-5-haiku-latest",
        label: "Claude 3.5 Haiku",
        provider: "anthropic",
        price: 100,
    },
    {
        value: "claude-sonnet-4-5",
        label: "Claude Sonnet 4.5",
        provider: "anthropic",
        price: 100,
    },
    {
        value: "claude-haiku-4-5",
        label: "Claude Haiku 4.5",
        provider: "anthropic",
        price: 100,
    },
    {
        value: "deepseek-chat",
        label: "DeepSeek Chat",
        provider: "deepseek",
        price: 0,
    },
    {
        value: "deepseek-reasoner",
        label: "DeepSeek Reasoner",
        provider: "deepseek",
        price: 100,
    },
];

export const modelsByValue = Object.fromEntries(
    models.map(m => [m.value, m])
);


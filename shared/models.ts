export type Provider = "openai" | "anthropic" | "deepseek";

export type Model = {
    value: string;
    label: string;
    provider: Provider;
    price: number;
    disabled: boolean;
    hideTemp?: boolean;
    presetTemp?: number;
};

export const models = [
    {
        value: "gpt-4o-mini",
        label: "GPT-4o Mini",
        provider: "openai",
        price: 0,
        disabled: false,
    },
    {
        value: "gpt-4o",
        label: "GPT-4o",
        provider: "openai",
        price: 100,
        disabled: true,
    },
    {
        value: "gpt-5-mini",
        label: "GPT-5 Mini",
        provider: "openai",
        price: 0,
        hideTemp: true,
        presetTemp: 1,
        disabled: false,
    },
    {
        value: "gpt-5.2",
        label: "GPT-5.2",
        provider: "openai",
        price: 200,
        hideTemp: true,
        presetTemp: 1,
        disabled: true,
    },
    {
        value: "o1-mini",
        label: "o1 Mini",
        provider: "openai",
        price: 100,
        disabled: true,
        hideTemp: true,
        presetTemp: 1,
    },
    {
        value: "claude-3-5-sonnet-latest",
        label: "Claude 3.5 Sonnet",
        provider: "anthropic",
        price: 200,
        disabled: true,
    },
    {
        value: "claude-3-5-haiku-latest",
        label: "Claude 3.5 Haiku",
        provider: "anthropic",
        price: 100,
        disabled: true,
    },
    {
        value: "deepseek-chat",
        label: "DeepSeek Chat",
        provider: "deepseek",
        price: 0,
        disabled: false,
    },
    {
        value: "deepseek-reasoner",
        label: "DeepSeek Reasoner",
        provider: "deepseek",
        price: 100,
        disabled: true,
    },
];

export const modelsByValue = Object.fromEntries(
    models.map(m => [m.value, m])
);


export type Provider = "openai" | "anthropic" | "deepseek";

export type Model = {
    value: string;
    label: string;
    provider: Provider;
    supportsReasoningEffort:? boolean;
    price: number;
    disabled?: boolean;
};

export const models: Model[];
export const modelsByValue: Record<string, Model>;

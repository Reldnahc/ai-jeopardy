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

export const models: Model[];
export const modelsByValue: Record<string, Model>;

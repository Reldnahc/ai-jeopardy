import { describe, expect, it } from "vitest";
import { createModelsByValue, getAvailableModels, getModelPricingUsdPer1M } from "./models.js";

describe("models", () => {
  it("hides Anthropic and DeepSeek models when their env-backed availability is absent", () => {
    const available = getAvailableModels({
      hasAnthropicApiKey: false,
      hasDeepSeekApiKey: false,
      hasGeminiApiKey: false,
    });

    expect(available.every((model) => model.provider !== "anthropic")).toBe(true);
    expect(available.every((model) => model.provider !== "deepseek")).toBe(true);
    expect(available.every((model) => model.provider !== "gemini")).toBe(true);
    expect(available.some((model) => model.provider === "openai")).toBe(true);
  });

  it("includes provider-specific models when their availability is enabled", () => {
    const available = getAvailableModels({
      hasAnthropicApiKey: true,
      hasDeepSeekApiKey: true,
      hasGeminiApiKey: true,
    });

    expect(available.some((model) => model.provider === "anthropic")).toBe(true);
    expect(available.some((model) => model.provider === "deepseek")).toBe(true);
    expect(available.some((model) => model.provider === "gemini")).toBe(true);
  });

  it("creates a lookup map from the provided model list", () => {
    const available = getAvailableModels({
      hasAnthropicApiKey: false,
      hasDeepSeekApiKey: false,
      hasGeminiApiKey: false,
    });

    const byValue = createModelsByValue(available);

    expect(byValue["gpt-4o-mini"]?.label).toBe("GPT-4o Mini");
    expect(byValue["claude-sonnet-4-6"]).toBeUndefined();
  });

  it("exposes pricing data from the shared model catalog", () => {
    expect(getModelPricingUsdPer1M("gpt-4o-mini")).toEqual({
      inputPer1M: 0.15,
      outputPer1M: 0.6,
      reasoningPer1M: undefined,
    });
    expect(getModelPricingUsdPer1M("missing-model")).toBeNull();
  });
});

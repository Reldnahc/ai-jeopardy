import { describe, expect, it } from "vitest";
import { createModelsByValue, getAvailableModels } from "./models.js";

describe("models", () => {
  it("hides Anthropic and DeepSeek models when their env-backed availability is absent", () => {
    const available = getAvailableModels({
      hasAnthropicApiKey: false,
      hasDeepSeekApiKey: false,
    });

    expect(available.every((model) => model.provider !== "anthropic")).toBe(true);
    expect(available.every((model) => model.provider !== "deepseek")).toBe(true);
    expect(available.some((model) => model.provider === "openai")).toBe(true);
  });

  it("includes provider-specific models when their availability is enabled", () => {
    const available = getAvailableModels({
      hasAnthropicApiKey: true,
      hasDeepSeekApiKey: true,
    });

    expect(available.some((model) => model.provider === "anthropic")).toBe(true);
    expect(available.some((model) => model.provider === "deepseek")).toBe(true);
  });

  it("creates a lookup map from the provided model list", () => {
    const available = getAvailableModels({
      hasAnthropicApiKey: false,
      hasDeepSeekApiKey: false,
    });

    const byValue = createModelsByValue(available);

    expect(byValue["gpt-4o-mini"]?.label).toBe("GPT-4o Mini");
    expect(byValue["claude-sonnet-4-6"]).toBeUndefined();
  });
});

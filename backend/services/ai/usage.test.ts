import { describe, expect, it } from "vitest";

import { extractAiUsage } from "./usage.js";

describe("extractAiUsage", () => {
  it("reads Gemini token usage from usageMetadata", () => {
    const usage = extractAiUsage(
      {
        usageMetadata: {
          promptTokenCount: 1200,
          candidatesTokenCount: 450,
          totalTokenCount: 1725,
          thoughtsTokenCount: 75,
        },
      },
      "gemini-2.5-pro",
    );

    expect(usage).toMatchObject({
      prompt_tokens: 1200,
      completion_tokens: 450,
      total_tokens: 1725,
      reasoning_tokens: 75,
    });
    expect(usage.cost_usd).toBeGreaterThan(0);
  });
});

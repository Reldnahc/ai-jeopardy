import { describe, expect, it } from "vitest";

import { categoryPrompt, finalPrompt } from "./boardPrompts.js";

describe("board prompts", () => {
  it("renders the live category prompt through the shared template path", () => {
    const prompt = categoryPrompt("World Rivers", false, {
      includeVisuals: false,
      maxVisualCluesPerCategory: 2,
      reasoningEffort: "low",
      maxImageSearchTries: 6,
      commonsThumbWidth: 1600,
      preferPhotos: true,
      includeExamples: false,
      includeFillTemplate: false,
    });

    expect(prompt).toContain('Write ONE complete Jeopardy category titled: "World Rivers"');
    expect(prompt).toContain("VERIFICATION STEP (LOW):");
    expect(prompt).toContain('"values" must be exactly [200,400,600,800,1000] in ascending order.');
  });

  it("renders the live final prompt through the shared template path", () => {
    const prompt = finalPrompt("Scientific Discoveries");

    expect(prompt).toContain(
      'Create ONE Final Jeopardy clue for category: "Scientific Discoveries"',
    );
    expect(prompt).toContain("OUTPUT ONLY valid JSON in this exact shape:");
  });
});

import { describe, expect, it } from "vitest";
import { buildImageJudgePrompt, buildJudgePrompt } from "./prompt.js";

describe("judge prompt builders", () => {
  it("builds lenient text-judge prompt with lenient guidance", () => {
    const prompt = buildJudgePrompt({
      transcriptRaw: "there's an exoplanet",
      expectedRaw: "what is an exoplanet",
      question: "This world orbits outside our solar system.",
      category: "Space",
      normT: "an exoplanet",
      normA: "an exoplanet",
      answerType: "thing",
      strictness: "lenient",
    });

    expect(prompt).toContain("SCORING INTENT (LENIENT)");
    expect(prompt).not.toContain("SCORING INTENT (STRICT)");
    expect(prompt).toContain("EXPECTED ANSWER TYPE: thing");
    expect(prompt).toContain('CATEGORY: "Space"');
  });

  it("builds standard text-judge prompt with strict guidance", () => {
    const prompt = buildJudgePrompt({
      transcriptRaw: "mars",
      expectedRaw: "jupiter",
      question: "Largest planet in our solar system",
      category: "Space",
      normT: "mars",
      normA: "jupiter",
      answerType: "place",
      strictness: "standard",
    });

    expect(prompt).toContain("SCORING INTENT (STRICT)");
    expect(prompt).not.toContain("SCORING INTENT (LENIENT)");
    expect(prompt).toContain("EXPECTED ANSWER TYPE: place");
  });

  it("clamps long clue and transcript inputs", () => {
    const longClue = "q".repeat(1400);
    const longTranscript = "t".repeat(900);
    const longExpected = "e".repeat(900);
    const prompt = buildJudgePrompt({
      transcriptRaw: longTranscript,
      expectedRaw: longExpected,
      question: longClue,
      category: "c".repeat(500),
      normT: "t",
      normA: "e",
      answerType: "title",
      strictness: "lenient",
    });

    expect(prompt).not.toContain("q".repeat(1300));
    expect(prompt).not.toContain("c".repeat(220));
    expect(prompt).not.toContain("t".repeat(850));
    expect(prompt).not.toContain("e".repeat(850));
  });

  it("builds image-judge prompt with expected answer and type", () => {
    const prompt = buildImageJudgePrompt({
      expectedRaw: "Alex Trebek",
      answerType: "person",
    });

    expect(prompt).toContain('Return STRICT JSON ONLY:');
    expect(prompt).toContain("EXPECTED ANSWER TYPE: person");
    expect(prompt).toContain('Expected Answer (raw): "Alex Trebek"');
  });

  it("handles missing category and question by falling back to empty strings", () => {
    const prompt = buildJudgePrompt({
      transcriptRaw: "mars",
      expectedRaw: "jupiter",
      question: undefined as unknown as string,
      category: undefined as unknown as string,
      normT: "mars",
      normA: "jupiter",
      answerType: "place",
      strictness: "standard",
    });

    expect(prompt).toContain('CATEGORY: ""');
    expect(prompt).toContain('CLUE/QUESTION: ""');
  });
});

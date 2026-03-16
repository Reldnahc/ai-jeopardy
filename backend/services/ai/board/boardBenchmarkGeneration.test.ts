import { describe, expect, it } from "vitest";

import {
  buildBoardGenerationJobs,
  buildGeneratedBoard,
  normalizeBoardSetCategories,
} from "./boardBenchmarkGeneration.js";

describe("board benchmark generation helpers", () => {
  it("normalizes board-set categories", () => {
    const categories = normalizeBoardSetCategories("board-1", [
      " History ",
      "Science",
      "Sports",
      "Music",
      "Movies",
      "Books",
      "Art",
      "Geography",
      "Math",
      "Animals",
      "Final",
    ]);

    expect(categories[0]).toBe("History");
    expect(categories).toHaveLength(11);
    expect(() => normalizeBoardSetCategories("board-1", ["only-one"]))
      .toThrow("board-1 must contain exactly 11 categories.");
  });

  it("builds jobs for both regular boards and final jeopardy", () => {
    const jobs = buildBoardGenerationJobs(
      [
        "History",
        "Science",
        "Sports",
        "Music",
        "Movies",
        "Books",
        "Art",
        "Geography",
        "Math",
        "Animals",
        "Final",
      ],
      {
        prompt_settings: { include_examples: false, include_fill_template: false },
      },
      process.cwd(),
    );

    expect(jobs).toHaveLength(11);
    expect(jobs[0]).toMatchObject({ section: "firstBoard", index: 0, categoryName: "History" });
    expect(jobs[5]).toMatchObject({ section: "secondBoard", index: 0, categoryName: "Books" });
    expect(jobs[10]).toMatchObject({
      section: "finalJeopardy",
      index: 0,
      categoryName: "Final",
    });
  });

  it("assembles generated board results into section order", () => {
    const board = buildGeneratedBoard({
      boardSetId: "board-1",
      workflowName: "baseline",
      provider: "openai",
      model: "gpt-5-mini",
      categories: [
        "History",
        "Science",
        "Sports",
        "Music",
        "Movies",
        "Books",
        "Art",
        "Geography",
        "Math",
        "Animals",
        "Final",
      ],
      results: [
        {
          section: "secondBoard",
          index: 1,
          categoryName: "Art",
          category: {
            category: "Art",
            values: [{ value: 400, question: "Q2", answer: "A2?", category: "Art" }],
          },
          usage: {
            provider: "openai",
            model: "gpt-5-mini",
            section: "secondBoard",
            category_name: "Art",
            prompt_tokens: 10,
            completion_tokens: 5,
            total_tokens: 15,
            reasoning_tokens: 0,
            cost_usd: 0.00001,
            queue_ms: 1,
            service_ms: 2,
            total_ms: 3,
            active_requests_at_start: 1,
            active_requests_at_end: 0,
          },
        },
        {
          section: "finalJeopardy",
          index: 0,
          categoryName: "Final",
          category: {
            category: "Final",
            values: [{ value: 0, question: "Final clue", answer: "Final?", category: "Final" }],
          },
          usage: {
            provider: "openai",
            model: "gpt-5-mini",
            section: "finalJeopardy",
            category_name: "Final",
            prompt_tokens: 10,
            completion_tokens: 5,
            total_tokens: 15,
            reasoning_tokens: 0,
            cost_usd: 0.00001,
            queue_ms: 1,
            service_ms: 2,
            total_ms: 3,
            active_requests_at_start: 1,
            active_requests_at_end: 0,
          },
        },
        {
          section: "firstBoard",
          index: 0,
          categoryName: "History",
          category: {
            category: "History",
            values: [{ value: 200, question: "Q1", answer: "A1?", category: "History" }],
          },
          usage: {
            provider: "openai",
            model: "gpt-5-mini",
            section: "firstBoard",
            category_name: "History",
            prompt_tokens: 10,
            completion_tokens: 5,
            total_tokens: 15,
            reasoning_tokens: 0,
            cost_usd: 0.00001,
            queue_ms: 1,
            service_ms: 2,
            total_ms: 3,
            active_requests_at_start: 1,
            active_requests_at_end: 0,
          },
        },
      ],
    });

    expect(board.firstBoard.categories[0]?.category).toBe("History");
    expect(board.secondBoard.categories[1]?.category).toBe("Art");
    expect(board.finalJeopardy.categories[0]?.category).toBe("Final");
    expect(board.requestUsage).toHaveLength(3);
  });
});

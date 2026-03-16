import { describe, expect, it } from "vitest";

import {
  callBoardClassifier,
  classifierBatches,
  flattenBoardClues,
  scoreBoardClues,
} from "./boardBenchmarkClassifier.js";

describe("board benchmark classifier helpers", () => {
  it("flattens board clues across all sections", () => {
    const clues = flattenBoardClues(
      {
        board_set_id: "board-1",
        workflow: "wf",
        provider: "openai",
        model: "gpt-5-mini",
        categories: ["History", "Science", "Final"],
        firstBoard: {
          categories: [
            {
              category: "History",
              values: [{ value: 200, question: "Q1", answer: "A1?", category: "History" }],
            },
          ],
        },
        secondBoard: {
          categories: [
            {
              category: "Science",
              values: [{ value: 400, question: "Q2", answer: "A2?", category: "Science" }],
            },
          ],
        },
        finalJeopardy: {
          categories: [
            {
              category: "Final",
              values: [{ value: 0, question: "Q3", answer: "A3?", category: "Final" }],
            },
          ],
        },
      },
      "board-1",
      "wf",
    );

    expect(clues).toEqual([
      expect.objectContaining({ board_type: "firstBoard", question: "Q1" }),
      expect.objectContaining({ board_type: "secondBoard", question: "Q2" }),
      expect.objectContaining({ board_type: "finalJeopardy", question: "Q3" }),
    ]);
  });

  it("batches clues for classifier requests", () => {
    expect(classifierBatches([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
  });

  it("posts classifier payloads and scores clues in order", async () => {
    const clues = [
      {
        board_set_id: "board-1",
        workflow: "wf",
        board_type: "firstBoard" as const,
        category_index: 0,
        clue_index: 0,
        category: "History",
        value: 200,
        question: "Q1",
        answer: "A1?",
      },
      {
        board_set_id: "board-1",
        workflow: "wf",
        board_type: "secondBoard" as const,
        category_index: 0,
        clue_index: 0,
        category: "Science",
        value: 400,
        question: "Q2",
        answer: "A2?",
      },
    ];

    const fetchCalls: RequestInit[] = [];
    const responses = [
      new Response(JSON.stringify([{ valid: true, confidence: 0.9, reason: null }])),
      new Response(JSON.stringify([{ valid: false, confidence: 0.2, reason: "vague" }])),
    ];
    const fetchImpl: typeof fetch = async (_input, init) => {
      fetchCalls.push(init ?? {});
      const response = responses.shift();
      if (!response) throw new Error("Missing test response");
      return response;
    };

    const scored = await scoreBoardClues({
      endpoint: "http://classifier",
      clues,
      batchSize: 1,
      fetchImpl,
    });

    expect(scored).toEqual([
      expect.objectContaining({ question: "Q1", classifier_valid: true, classifier_reason: null }),
      expect.objectContaining({
        question: "Q2",
        classifier_valid: false,
        classifier_reason: "vague",
      }),
    ]);
    expect(fetchCalls).toHaveLength(2);
    expect(fetchCalls[0]?.method).toBe("POST");
  });

  it("rejects malformed classifier responses", async () => {
    const fetchImpl: typeof fetch = async () => new Response(JSON.stringify([{ valid: true }]));

    await expect(
      callBoardClassifier(
        "http://classifier",
        [
          {
            board_set_id: "board-1",
            workflow: "wf",
            board_type: "firstBoard",
            category_index: 0,
            clue_index: 0,
            category: "History",
            value: 200,
            question: "Q1",
            answer: "A1?",
          },
          {
            board_set_id: "board-1",
            workflow: "wf",
            board_type: "firstBoard",
            category_index: 0,
            clue_index: 1,
            category: "History",
            value: 400,
            question: "Q2",
            answer: "A2?",
          },
        ],
        fetchImpl,
      ),
    ).rejects.toThrow("Classifier returned an invalid response.");
  });
});

import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { describe, expect, it } from "vitest";

import {
  chooseBoardSetsForWorkflow,
  summarizeClassifierResults,
  summarizeUsage,
} from "./boardBenchmarkWorkflow.js";
import { buildCategoryPromptFromWorkflow } from "./boardPromptTemplates.js";

describe("board benchmark workflow helpers", () => {
  it("generates deterministic board sets from a category pool", () => {
    const config = {
      random_seed: 42,
      category_pool: ["A", "B", "C", "D", "E", "F", "G", "H", "I", "J", "K", "L"],
      workflows: [],
    };

    const workflow = {
      name: "baseline",
      provider: "openai" as const,
      model: "gpt-5-mini",
      board_count: 2,
    };

    const first = chooseBoardSetsForWorkflow(config, workflow, 0);
    const second = chooseBoardSetsForWorkflow(config, workflow, 0);

    expect(first).toEqual(second);
    expect(first).toHaveLength(2);
    expect(first[0]?.categories).toHaveLength(11);
  });

  it("returns zero generated board sets when board_count is 0", () => {
    const config = {
      random_seed: 42,
      category_pool: ["A", "B", "C", "D", "E", "F", "G", "H", "I", "J", "K"],
      workflows: [],
    };

    const workflow = {
      name: "baseline",
      provider: "openai" as const,
      model: "gpt-5-mini",
      board_count: 0,
    };

    expect(chooseBoardSetsForWorkflow(config, workflow, 0)).toEqual([]);
  });

  it("summarizes classifier results by board type", () => {
    const summary = summarizeClassifierResults([
      {
        board_set_id: "b1",
        workflow: "wf",
        board_type: "firstBoard",
        category_index: 0,
        clue_index: 0,
        category: "Cat",
        value: 200,
        question: "Q1",
        answer: "A1?",
        classifier_valid: true,
        classifier_confidence: 0.9,
        classifier_reason: null,
      },
      {
        board_set_id: "b1",
        workflow: "wf",
        board_type: "finalJeopardy",
        category_index: 0,
        clue_index: 0,
        category: "Final",
        value: 0,
        question: "Q2",
        answer: "A2?",
        classifier_valid: false,
        classifier_confidence: 0.2,
        classifier_reason: "ambiguous",
      },
    ]);

    expect(summary.valid_rate).toBe(0.5);
    expect(summary.invalid_reason_counts).toEqual({ ambiguous: 1 });
    expect(summary.by_board_type.firstBoard.valid_rate).toBe(1);
    expect(summary.by_board_type.finalJeopardy.invalid_clues).toBe(1);
  });

  it("keeps invalid clue details in run summaries", () => {
    const summary = summarizeClassifierResults([
      {
        board_set_id: "b1",
        workflow: "wf",
        board_type: "firstBoard",
        category_index: 0,
        clue_index: 0,
        category: "Cat",
        value: 200,
        question: "Q1",
        answer: "A1?",
        classifier_valid: false,
        classifier_confidence: 0.33,
        classifier_reason: "too-vague",
      },
    ]);

    expect(summary.invalid_reason_counts).toEqual({ "too-vague": 1 });
  });

  it("summarizes request token usage and cost", () => {
    const usage = summarizeUsage([
      {
        provider: "openai",
        model: "gpt-4o-mini",
        section: "firstBoard",
        category_name: "Rivers",
        prompt_tokens: 1000,
        completion_tokens: 500,
        total_tokens: 1500,
        reasoning_tokens: 0,
        cost_usd: 0.00045,
      },
      {
        provider: "openai",
        model: "gpt-4o-mini",
        section: "secondBoard",
        category_name: "Capitals",
        prompt_tokens: 800,
        completion_tokens: 400,
        total_tokens: 1200,
        reasoning_tokens: 0,
        cost_usd: 0.00036,
      },
      {
        provider: "openai",
        model: "gpt-4o-mini",
        section: "finalJeopardy",
        category_name: "Final",
        prompt_tokens: null,
        completion_tokens: null,
        total_tokens: null,
        reasoning_tokens: null,
        cost_usd: null,
      },
    ]);

    expect(usage.prompt_tokens).toBe(1800);
    expect(usage.completion_tokens).toBe(900);
    expect(usage.total_tokens).toBe(2700);
    expect(usage.requests_with_usage).toBe(2);
    expect(usage.requests_missing_usage).toBe(1);
    expect(usage.average_tokens_per_request).toBe(1350);
    expect(usage.cost_usd).toBe(0.00081);
  });
});

describe("board prompt template sharing", () => {
  it("loads a custom category template file for benchmark workflows", () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "board-prompt-"));
    const templatePath = path.join(tempDir, "category_prompt.txt");
    fs.writeFileSync(
      templatePath,
      'Category "$CATEGORY" => $VALUES_JSON $CATEGORY_PROMPT_SUFFIX\n',
      "utf8",
    );

    const prompt = buildCategoryPromptFromWorkflow(
      "Rivers",
      false,
      {
        prompt_files: { category: templatePath },
        category_prompt_suffix: "suffix",
        prompt_settings: { include_examples: false, include_fill_template: false },
      },
      tempDir,
    );

    expect(prompt).toContain('Category "Rivers" => [200,400,600,800,1000] suffix');
  });
});

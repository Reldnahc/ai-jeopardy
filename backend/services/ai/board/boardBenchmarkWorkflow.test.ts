import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { describe, expect, it } from "vitest";

import {
  chooseBoardSetsForWorkflow,
  extractGeminiUsage,
  extractOpenAiUsage,
  getApiKeyNameForProvider,
  summarizeClassifierResults,
  summarizeUsage,
} from "./boardBenchmarkWorkflow.js";
import { buildBenchmarkSummary } from "./boardBenchmarkWorkflow.summary.js";
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
        queue_ms: 0,
        service_ms: 0,
        total_ms: 0,
        active_requests_at_start: null,
        active_requests_at_end: null,
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
        queue_ms: 0,
        service_ms: 0,
        total_ms: 0,
        active_requests_at_start: null,
        active_requests_at_end: null,
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
        queue_ms: 0,
        service_ms: 0,
        total_ms: 0,
        active_requests_at_start: null,
        active_requests_at_end: null,
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

  it("maps DeepSeek workflows to the DeepSeek API key", () => {
    expect(getApiKeyNameForProvider("deepseek")).toBe("DEEPSEEK_API_KEY");
    expect(getApiKeyNameForProvider("openai")).toBe("OPENAI_API_KEY");
    expect(getApiKeyNameForProvider("anthropic")).toBe("ANTHROPIC_API_KEY");
    expect(getApiKeyNameForProvider("gemini")).toBe("GEMINI_API_KEY");
  });

  it("extracts usage from OpenAI-compatible prompt/completion token fields", () => {
    const usage = extractOpenAiUsage(
      {
        usage: {
          prompt_tokens: 1200,
          completion_tokens: 600,
          total_tokens: 1800,
        },
      },
      "deepseek-chat",
    );

    expect(usage.prompt_tokens).toBe(1200);
    expect(usage.completion_tokens).toBe(600);
    expect(usage.total_tokens).toBe(1800);
    expect(usage.cost_usd).toBeGreaterThan(0);
  });

  it("extracts usage from Gemini usageMetadata fields", () => {
    const usage = extractGeminiUsage(
      {
        usageMetadata: {
          promptTokenCount: 900,
          candidatesTokenCount: 300,
          totalTokenCount: 1250,
          thoughtsTokenCount: 50,
        },
      },
      "gemini-2.5-flash",
    );

    expect(usage.prompt_tokens).toBe(900);
    expect(usage.completion_tokens).toBe(300);
    expect(usage.total_tokens).toBe(1250);
    expect(usage.reasoning_tokens).toBe(50);
    expect(usage.cost_usd).toBeGreaterThan(0);
  });

  it("builds workflow summaries from mixed run results", () => {
    const successfulRun = {
      workflow: "wf",
      board_set_id: "board-1",
      provider: "openai" as const,
      model: "gpt-5-mini",
      classifier_endpoint: "http://classifier",
      config_file: "config.json",
      generated_at: "2026-03-16 10:00:00",
      board: {
        board_set_id: "board-1",
        workflow: "wf",
        provider: "openai" as const,
        model: "gpt-5-mini",
        categories: ["Cat"],
        firstBoard: { categories: [] },
        secondBoard: { categories: [] },
        finalJeopardy: { categories: [] },
      },
      metrics: {
        total_clues: 2,
        valid_clues: 1,
        invalid_clues: 1,
        valid_rate: 0.5,
        average_confidence: 0.6,
        invalid_reason_counts: { vague: 1 },
        by_board_type: {
          firstBoard: { total_clues: 1, valid_clues: 1, invalid_clues: 0, valid_rate: 1 },
          secondBoard: { total_clues: 0, valid_clues: 0, invalid_clues: 0, valid_rate: 0 },
          finalJeopardy: { total_clues: 1, valid_clues: 0, invalid_clues: 1, valid_rate: 0 },
        },
      },
      timing: {
        total_ms: 200,
        generation_ms: 120,
        classifier_ms: 80,
        total_seconds: 0.2,
        generation_seconds: 0.12,
        classifier_seconds: 0.08,
        clues_per_second: 10,
        request_queue_ms: 15,
        request_service_ms: 25,
        avg_request_queue_ms: 15,
        avg_request_service_ms: 25,
        max_request_queue_ms: 15,
        max_request_service_ms: 25,
        max_active_requests_seen: 2,
      },
      usage: {
        prompt_tokens: 100,
        completion_tokens: 50,
        total_tokens: 150,
        reasoning_tokens: 0,
        requests_with_usage: 1,
        requests_missing_usage: 0,
        average_tokens_per_request: 150,
        cost_usd: 0.00012,
      },
      request_usage: [
        {
          provider: "openai" as const,
          model: "gpt-5-mini",
          section: "firstBoard" as const,
          category_name: "Cat",
          prompt_tokens: 100,
          completion_tokens: 50,
          total_tokens: 150,
          reasoning_tokens: 0,
          cost_usd: 0.00012,
          queue_ms: 15,
          service_ms: 25,
          total_ms: 40,
          active_requests_at_start: 1,
          active_requests_at_end: 0,
        },
      ],
      scored_clues: [
        {
          board_set_id: "board-1",
          workflow: "wf",
          board_type: "firstBoard" as const,
          category_index: 0,
          clue_index: 0,
          category: "Cat",
          value: 200,
          question: "Q1",
          answer: "A1",
          classifier_valid: true,
          classifier_confidence: 0.9,
          classifier_reason: null,
        },
        {
          board_set_id: "board-1",
          workflow: "wf",
          board_type: "finalJeopardy" as const,
          category_index: 0,
          clue_index: 0,
          category: "Final",
          value: 0,
          question: "Q2",
          answer: "A2",
          classifier_valid: false,
          classifier_confidence: 0.3,
          classifier_reason: "vague",
        },
      ],
      invalid_clues: [
        {
          board_type: "finalJeopardy" as const,
          category_index: 0,
          clue_index: 0,
          category: "Final",
          value: 0,
          question: "Q2",
          answer: "A2",
          classifier_reason: "vague",
          classifier_confidence: 0.3,
        },
      ],
      status: "success" as const,
    };

    const failedRun = {
      workflow: "wf",
      board_set_id: "board-2",
      provider: "openai" as const,
      model: "gpt-5-mini",
      classifier_endpoint: "http://classifier",
      config_file: "config.json",
      generated_at: "2026-03-16 10:05:00",
      status: "failed" as const,
      error: "boom",
    };

    const summary = buildBenchmarkSummary([successfulRun, failedRun], {
      wf: { wall_clock_ms: 250 },
    });

    expect(summary.success_count).toBe(1);
    expect(summary.failure_count).toBe(1);
    expect(summary.runs[0]).toMatchObject({
      workflow: "wf",
      board_set_id: "board-1",
      valid_rate: 0.5,
    });
    expect(summary.workflow_leaderboard[0]).toMatchObject({
      workflow: "wf",
      boards_generated: 1,
      valid_rate: 0.5,
      usage: { total_tokens: 150 },
      timing: { total_ms: 250, max_active_requests_seen: 2 },
    });
    expect(summary.failed_runs).toEqual([failedRun]);
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

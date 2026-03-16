import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { describe, expect, it } from "vitest";

import {
  writeBenchmarkSummaryArtifact,
  writeFailedRunArtifact,
  writeSuccessfulRunArtifacts,
} from "./boardBenchmarkArtifacts.js";

describe("board benchmark artifact writers", () => {
  it("writes successful run and invalid-clue artifacts", () => {
    const outputDir = fs.mkdtempSync(path.join(os.tmpdir(), "benchmark-artifacts-"));
    const { runFile, invalidFile } = writeSuccessfulRunArtifacts({
      outputDir,
      timestamp: "20260316-101010",
      runResult: {
        workflow: "wf",
        board_set_id: "board-1",
        provider: "openai",
        model: "gpt-5-mini",
        classifier_endpoint: "http://classifier",
        config_file: "config.json",
        generated_at: "2026-03-16 10:10:10",
        board: {
          board_set_id: "board-1",
          workflow: "wf",
          provider: "openai",
          model: "gpt-5-mini",
          categories: ["History"],
          firstBoard: { categories: [] },
          secondBoard: { categories: [] },
          finalJeopardy: { categories: [] },
        },
        metrics: {
          total_clues: 1,
          valid_clues: 1,
          invalid_clues: 0,
          valid_rate: 1,
          average_confidence: 0.9,
          invalid_reason_counts: {},
          by_board_type: {
            firstBoard: { total_clues: 1, valid_clues: 1, invalid_clues: 0, valid_rate: 1 },
            secondBoard: { total_clues: 0, valid_clues: 0, invalid_clues: 0, valid_rate: 0 },
            finalJeopardy: { total_clues: 0, valid_clues: 0, invalid_clues: 0, valid_rate: 0 },
          },
        },
        timing: {
          total_ms: 100,
          generation_ms: 60,
          classifier_ms: 40,
          total_seconds: 0.1,
          generation_seconds: 0.06,
          classifier_seconds: 0.04,
          clues_per_second: 10,
          request_queue_ms: 5,
          request_service_ms: 10,
          avg_request_queue_ms: 5,
          avg_request_service_ms: 10,
          max_request_queue_ms: 5,
          max_request_service_ms: 10,
          max_active_requests_seen: 1,
        },
        usage: {
          prompt_tokens: 10,
          completion_tokens: 5,
          total_tokens: 15,
          reasoning_tokens: 0,
          requests_with_usage: 1,
          requests_missing_usage: 0,
          average_tokens_per_request: 15,
          cost_usd: 0.00001,
        },
        request_usage: [
          {
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
        ],
        scored_clues: [],
        invalid_clues: [],
        status: "success",
      },
    });

    expect(path.basename(runFile)).toBe("20260316-101010_wf_board-1.json");
    expect(path.basename(invalidFile)).toBe("20260316-101010_wf_board-1_invalid.json");
    expect(JSON.parse(fs.readFileSync(runFile, "utf8")).status).toBe("success");
    expect(JSON.parse(fs.readFileSync(invalidFile, "utf8"))).toMatchObject({
      workflow: "wf",
      board_set_id: "board-1",
      invalid_clue_count: 0,
    });
  });

  it("writes failed run and summary artifacts", () => {
    const outputDir = fs.mkdtempSync(path.join(os.tmpdir(), "benchmark-artifacts-"));
    const failedFile = writeFailedRunArtifact({
      outputDir,
      timestamp: "20260316-101010",
      failedRun: {
        workflow: "wf",
        board_set_id: "board-2",
        provider: "openai",
        model: "gpt-5-mini",
        classifier_endpoint: "http://classifier",
        config_file: "config.json",
        generated_at: "2026-03-16 10:10:10",
        status: "failed",
        error: "boom",
      },
    });
    const summaryFile = writeBenchmarkSummaryArtifact({
      outputDir,
      timestamp: "20260316-101010",
      summary: { ok: true },
    });

    expect(path.basename(failedFile)).toBe("20260316-101010_wf_board-2_failed.json");
    expect(JSON.parse(fs.readFileSync(failedFile, "utf8"))).toMatchObject({
      status: "failed",
      error: "boom",
    });
    expect(path.basename(summaryFile)).toBe("20260316-101010_summary.json");
    expect(JSON.parse(fs.readFileSync(summaryFile, "utf8"))).toEqual({ ok: true });
  });
});

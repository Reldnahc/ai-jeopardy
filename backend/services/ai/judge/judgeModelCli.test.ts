import { beforeEach, describe, expect, it, vi } from "vitest";
import { appConfig } from "../../../config/appConfig.js";

const { judgeClueAnswerWithModelDetailedMock, readFileSyncMock } = vi.hoisted(() => ({
  judgeClueAnswerWithModelDetailedMock: vi.fn(),
  readFileSyncMock: vi.fn(),
}));

vi.mock("./judgeText.js", () => ({
  judgeClueAnswerWithModelDetailed: judgeClueAnswerWithModelDetailedMock,
}));

vi.mock("node:fs", () => ({
  default: {
    readFileSync: readFileSyncMock,
  },
}));

import {
  buildJudgeReportPath,
  loadJudgeCases,
  normalizeConcurrency,
  normalizeJudgeModel,
  parseCliArgs,
  runJudgeCases,
} from "./judgeModelCli.js";

describe("judgeModelCli", () => {
  beforeEach(() => {
    judgeClueAnswerWithModelDetailedMock.mockReset();
    readFileSyncMock.mockReset();
  });

  it("normalizes judge model names", () => {
    expect(normalizeJudgeModel("deepseek-chat")).toBe("deepseek-chat");
    expect(normalizeJudgeModel("  ")).toBe(appConfig.ai.judgeModel);
  });

  it("normalizes concurrency values", () => {
    expect(normalizeConcurrency(4)).toBe(4);
    expect(normalizeConcurrency("0")).toBe(8);
    expect(normalizeConcurrency("bad")).toBe(8);
  });

  it("parses cli args", () => {
    expect(
      parseCliArgs([
        "--model",
        "gpt-4o-mini",
        "--cases",
        "cases.json",
        "--concurrency",
        "12",
        "--output-dir",
        "judge_reports",
      ]),
    ).toEqual({
      model: appConfig.ai.judgeModel,
      casesFile: "cases.json",
      concurrency: 12,
      outputDir: "judge_reports",
    });
  });

  it("builds a stable report path", () => {
    const reportPath = buildJudgeReportPath({
      outputDir: "judge_reports",
      model: "deepseek-chat",
      date: new Date(2026, 2, 16, 12, 34, 56),
    });

    expect(reportPath).toContain("judge_reports");
    expect(reportPath).toContain("20260316-123456_deepseek-chat.json");
  });

  it("loads validated judge cases from JSON", () => {
    readFileSyncMock.mockReturnValue(
      JSON.stringify([
        {
          name: "Exact Match",
          category: "Space",
          question: "Planet with rings",
          expectedAnswer: "Saturn",
          transcript: "Saturn",
          expectedVerdict: "correct",
        },
      ]),
    );

    expect(loadJudgeCases("cases.json")).toEqual([
      {
        name: "Exact Match",
        category: "Space",
        question: "Planet with rings",
        expectedAnswer: "Saturn",
        transcript: "Saturn",
        expectedVerdict: "correct",
      },
    ]);
  });

  it("runs cases through the shared judge helper with the configured model", async () => {
    judgeClueAnswerWithModelDetailedMock
      .mockResolvedValueOnce({
        verdict: "correct",
        diagnostics: {
          path: "model",
          model: "deepseek-chat",
          total_ms: 12,
          model_ms: 11,
          usage: {
            prompt_tokens: 100,
            completion_tokens: 20,
            total_tokens: 120,
            reasoning_tokens: 0,
            cost_usd: 0.0000364,
          },
          parser_failed: false,
        },
      })
      .mockResolvedValueOnce({
        verdict: "incorrect",
        diagnostics: {
          path: "fast_accept",
          model: null,
          total_ms: 1,
          model_ms: null,
          usage: null,
          parser_failed: false,
        },
      });

    const summary = await runJudgeCases({
      model: "deepseek-chat",
      concurrency: 4,
      cases: [
        {
          name: "Case 1",
          category: "Space",
          question: "Planet with rings",
          expectedAnswer: "Saturn",
          transcript: "Saturn",
          expectedVerdict: "correct",
        },
        {
          name: "Case 2",
          category: "Animals",
          question: "House pet",
          expectedAnswer: "cat",
          transcript: "dog",
          expectedVerdict: "correct",
        },
      ],
    });

    expect(judgeClueAnswerWithModelDetailedMock).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        model: "deepseek-chat",
        category: "Space",
      }),
    );
    expect(summary.passCount).toBe(1);
    expect(summary.failCount).toBe(1);
    expect(summary.concurrency).toBe(4);
    expect(summary.total_ms).toBe(13);
    expect(summary.model_call_count).toBe(1);
    expect(summary.fast_path_count).toBe(1);
    expect(summary.usage.total_tokens).toBe(120);
    expect(summary.usage.cost_usd).toBe(0.0000364);
  });
});

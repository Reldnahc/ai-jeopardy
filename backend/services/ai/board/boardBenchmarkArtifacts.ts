import fs from "node:fs";
import path from "node:path";

import type { FailedRunResult, RunResult } from "./boardBenchmarkWorkflow.types.js";

function saveJsonFile(filePath: string, data: unknown) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(data, null, 2)}\n`, "utf8");
}

export function writeSuccessfulRunArtifacts(args: {
  outputDir: string;
  timestamp: string;
  runResult: RunResult;
}) {
  const runFile = path.join(
    args.outputDir,
    `${args.timestamp}_${args.runResult.workflow}_${args.runResult.board_set_id}.json`,
  );
  const invalidFile = path.join(
    args.outputDir,
    `${args.timestamp}_${args.runResult.workflow}_${args.runResult.board_set_id}_invalid.json`,
  );

  saveJsonFile(runFile, args.runResult);
  saveJsonFile(invalidFile, {
    workflow: args.runResult.workflow,
    board_set_id: args.runResult.board_set_id,
    invalid_clue_count: args.runResult.invalid_clues.length,
    timing: args.runResult.timing,
    usage: args.runResult.usage,
    request_usage: args.runResult.request_usage,
    invalid_clues: args.runResult.invalid_clues,
  });

  return { runFile, invalidFile };
}

export function writeFailedRunArtifact(args: {
  outputDir: string;
  timestamp: string;
  failedRun: FailedRunResult;
}) {
  const failedFile = path.join(
    args.outputDir,
    `${args.timestamp}_${args.failedRun.workflow}_${args.failedRun.board_set_id}_failed.json`,
  );
  saveJsonFile(failedFile, args.failedRun);
  return failedFile;
}

export function writeBenchmarkSummaryArtifact(args: {
  outputDir: string;
  timestamp: string;
  summary: unknown;
}) {
  const summaryFile = path.join(args.outputDir, `${args.timestamp}_summary.json`);
  saveJsonFile(summaryFile, args.summary);
  return summaryFile;
}

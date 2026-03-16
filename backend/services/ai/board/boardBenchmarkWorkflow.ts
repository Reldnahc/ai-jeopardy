import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { writeBenchmarkSummaryArtifact } from "./boardBenchmarkArtifacts.js";
import {
  buildBenchmarkSummary,
  extractOpenAiUsage,
  summarizeClassifierResults,
  summarizeUsage,
} from "./boardBenchmarkWorkflow.summary.js";
import {
  chooseBoardSetsForWorkflow,
  currentTimestamp,
  DEFAULT_CLASSIFIER_BATCH_SIZE,
  DEFAULT_CLASSIFIER_ENDPOINT,
  DEFAULT_MAX_CONCURRENCY,
  DEFAULT_OUTPUT_DIR,
  DEFAULT_REQUEST_SPACING_SECONDS,
  getApiKeyNameForProvider,
  loadJsonFile,
  parseCliArgs,
  parseDotenv,
  requireBenchmarkString,
  timestampId,
  type BenchmarkConfig,
} from "./boardBenchmarkConfig.js";
import {
  createActiveRequestTracker,
  createAsyncLimiter,
  makeRequestThrottler,
  runBoardSetBenchmark,
} from "./boardBenchmarkExecution.js";
import type { AnyRunResult } from "./boardBenchmarkWorkflow.types.js";

export { chooseBoardSetsForWorkflow, getApiKeyNameForProvider };
export { extractOpenAiUsage, summarizeClassifierResults, summarizeUsage };

export async function runBenchmark(
  config: BenchmarkConfig,
  dotenvValues: Record<string, string>,
  configPath: string,
) {
  const classifierEndpoint = String(
    config.classifier_endpoint ?? DEFAULT_CLASSIFIER_ENDPOINT,
  ).trim();
  const classifierBatchSize = Number(config.classifier_batch_size ?? DEFAULT_CLASSIFIER_BATCH_SIZE);
  const outputDir = path.resolve(
    path.dirname(configPath),
    String(config.output_dir ?? DEFAULT_OUTPUT_DIR),
  );
  fs.mkdirSync(outputDir, { recursive: true });

  if (!Array.isArray(config.workflows) || config.workflows.length === 0) {
    throw new Error("Config must include a non-empty workflows array.");
  }

  const runResults: AnyRunResult[] = [];
  const workflowTimingByName: Record<string, { wall_clock_ms: number }> = {};
  const timestamp = timestampId();
  const configDir = path.dirname(configPath);

  for (const [workflowIndex, workflow] of config.workflows.entries()) {
    const workflowName = requireBenchmarkString(workflow.name, "workflow.name");
    const workflowStartedAt = Date.now();
    const boardSets = chooseBoardSetsForWorkflow(config, workflow, workflowIndex);
    const workflowThrottle = makeRequestThrottler(
      workflow.request_spacing_seconds ?? DEFAULT_REQUEST_SPACING_SECONDS,
    );
    const workflowRequestLimiter = createAsyncLimiter(
      Math.max(1, Number(workflow.max_concurrency ?? DEFAULT_MAX_CONCURRENCY)),
    );
    const workflowActiveRequestTracker = createActiveRequestTracker();

    const workflowRunResults = await Promise.all(
      boardSets.map((boardSet) =>
        runBoardSetBenchmark({
          boardSet,
          workflow,
          dotenvValues,
          configDir,
          classifierEndpoint,
          classifierBatchSize,
          outputDir,
          timestamp,
          configPath,
          sharedThrottle: workflowThrottle,
          sharedRequestLimiter: workflowRequestLimiter,
          activeRequestTracker: workflowActiveRequestTracker,
        }),
      ),
    );

    runResults.push(...workflowRunResults);
    workflowTimingByName[workflowName] = {
      wall_clock_ms: Math.max(0, Date.now() - workflowStartedAt),
    };
  }

  const summary = {
    config_file: configPath,
    generated_at: currentTimestamp(),
    classifier_endpoint: classifierEndpoint,
    run_count: runResults.length,
    summary: buildBenchmarkSummary(runResults, workflowTimingByName),
  };
  writeBenchmarkSummaryArtifact({ outputDir, timestamp, summary });
  return summary;
}

async function main() {
  const { config, dotenvFile } = parseCliArgs(process.argv.slice(2));
  const configPath = path.resolve(process.cwd(), config);

  if (!fs.existsSync(configPath)) {
    throw new Error(`Config file not found: ${configPath}`);
  }

  const dotenvValues = parseDotenv(path.resolve(process.cwd(), dotenvFile));
  const configJson = loadJsonFile<BenchmarkConfig>(configPath);
  const summary = await runBenchmark(configJson, dotenvValues, configPath);

  console.log(
    `\nCompleted runs: success=${summary.summary.success_count} failed=${summary.summary.failure_count}`,
  );

  console.log("\nWorkflow leaderboard:");
  summary.summary.workflow_leaderboard.forEach((item, index) => {
    console.log(
      `${index + 1}. ${item.workflow} provider=${item.provider} model=${item.model} boards=${item.boards_generated} valid_rate=${(item.valid_rate * 100).toFixed(2)}% invalid=${item.invalid_clues} avg_confidence=${item.average_confidence} total_s=${item.timing.total_seconds} gen_s=${item.timing.generation_seconds} cls_s=${item.timing.classifier_seconds} q_avg_ms=${item.timing.avg_request_queue_ms ?? "n/a"} svc_avg_ms=${item.timing.avg_request_service_ms ?? "n/a"} max_active=${item.timing.max_active_requests_seen ?? "n/a"} cps=${item.timing.clues_per_second} tokens=${item.usage.total_tokens} cost=${item.usage.cost_usd ?? "n/a"}`,
      // total_s is true workflow wall clock; generation/classifier are aggregate effort across runs.
    );
  });

  console.log("\nRun leaderboard:");
  summary.summary.runs.forEach((item, index) => {
    console.log(
      `${index + 1}. ${item.workflow} / ${item.board_set_id} valid_rate=${(item.valid_rate * 100).toFixed(2)}% invalid=${item.invalid_clues} avg_confidence=${item.average_confidence} wall_s=${item.timing.total_seconds} gen_s=${item.timing.generation_seconds} cls_s=${item.timing.classifier_seconds} q_avg_ms=${item.timing.avg_request_queue_ms ?? "n/a"} svc_avg_ms=${item.timing.avg_request_service_ms ?? "n/a"} max_active=${item.timing.max_active_requests_seen ?? "n/a"} cps=${item.timing.clues_per_second} tokens=${item.usage.total_tokens} cost=${item.usage.cost_usd ?? "n/a"}`,
    );
  });

  if (summary.summary.failed_runs.length > 0) {
    console.log("\nFailed runs:");
    summary.summary.failed_runs.forEach((item, index) => {
      console.log(
        `${index + 1}. ${item.workflow} / ${item.board_set_id} provider=${item.provider} model=${item.model} error=${item.error}`,
      );
    });
  }
}

const entryArg = process.argv[1] ? path.resolve(process.argv[1]) : "";
const isDirectRun = entryArg ? import.meta.url === pathToFileURL(entryArg).href : false;

if (isDirectRun) {
  void main().catch((error) => {
    const message = error instanceof Error ? error.message : String(error);
    console.error(message);
    process.exitCode = 1;
  });
}

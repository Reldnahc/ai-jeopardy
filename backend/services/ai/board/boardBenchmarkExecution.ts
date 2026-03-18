import path from "node:path";

import {
  buildGeneratedBoard,
  buildBoardGenerationJobs,
  normalizeBoardSetCategories,
  type BoardGenerationResult,
} from "./boardBenchmarkGeneration.js";
import { flattenBoardClues, scoreBoardClues } from "./boardBenchmarkClassifier.js";
import { writeFailedRunArtifact, writeSuccessfulRunArtifacts } from "./boardBenchmarkArtifacts.js";
import {
  computeRunTiming,
  extractAnthropicUsage,
  extractGeminiUsage,
  extractInvalidClueDetails,
  extractOpenAiUsage,
  summarizeClassifierResults,
  summarizeUsage,
} from "./boardBenchmarkWorkflow.summary.js";
import type {
  FailedRunResult,
  RequestUsage,
  RequestUsageCore,
  RunResult,
} from "./boardBenchmarkWorkflow.types.js";
import {
  DEFAULT_MAX_CONCURRENCY,
  DEFAULT_MAX_OUTPUT_TOKENS,
  DEFAULT_MAX_RETRIES,
  DEFAULT_REQUEST_SPACING_SECONDS,
  currentTimestamp,
  getApiKeyNameForProvider,
  getConfigValue,
  requireBenchmarkString,
  type BenchmarkBoardSet,
  type BenchmarkWorkflow,
} from "./boardBenchmarkConfig.js";
import {
  callAiJson,
  parseAiJson,
  resolveProviderForModel,
  type ReasoningEffort,
} from "../aiClients/index.js";

const REQUEST_DEBUG = process.env.BENCHMARK_REQUEST_DEBUG === "1";

export type RequestThrottler = () => Promise<void>;
export type AsyncLimiter = <T>(task: () => Promise<T>) => Promise<T>;
export type ActiveRequestTracker = {
  start: () => { active: number; maxSeen: number };
  end: () => { active: number; maxSeen: number };
  snapshot: () => { active: number; maxSeen: number };
};

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function makeRequestThrottler(spacingSeconds: number): RequestThrottler {
  let nextAllowed = 0;
  let chain = Promise.resolve();

  return async () => {
    const execute = async () => {
      const now = Date.now();
      const waitMs = Math.max(0, nextAllowed - now);
      if (waitMs > 0) {
        await sleep(waitMs);
      }
      nextAllowed = Date.now() + spacingSeconds * 1000;
    };

    const pending = chain.then(execute, execute);
    chain = pending.catch(() => undefined);
    await pending;
  };
}

export function createAsyncLimiter(concurrency: number): AsyncLimiter {
  let active = 0;
  const queue: Array<() => void> = [];

  const pump = () => {
    if (active >= concurrency) return;
    const next = queue.shift();
    if (!next) return;
    active += 1;
    next();
  };

  return async function runLimited<T>(task: () => Promise<T>) {
    await new Promise<void>((resolve) => {
      queue.push(resolve);
      pump();
    });

    try {
      return await task();
    } finally {
      active -= 1;
      pump();
    }
  };
}

export function createActiveRequestTracker(): ActiveRequestTracker {
  let active = 0;
  let maxSeen = 0;

  return {
    start() {
      active += 1;
      if (active > maxSeen) maxSeen = active;
      return { active, maxSeen };
    },
    end() {
      active = Math.max(0, active - 1);
      return { active, maxSeen };
    },
    snapshot() {
      return { active, maxSeen };
    },
  };
}

async function callProviderJson(args: {
  provider: BenchmarkWorkflow["provider"];
  apiKey: string;
  model: string;
  systemPrompt: string;
  prompt: string;
  maxOutputTokens: number;
  maxRetries: number;
  reasoningEffort?: ReasoningEffort;
  throttle: RequestThrottler;
}): Promise<{
  data: unknown;
  usage: Omit<RequestUsageCore, "provider" | "model" | "section" | "category_name">;
}> {
  const { provider, apiKey, model, systemPrompt, prompt, maxRetries, reasoningEffort, throttle } =
    args;

  for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
    try {
      await throttle();

      const response = await callAiJson(model, prompt, {
        reasoningEffort,
        systemPrompt,
        providerOverride: provider,
        apiKeyOverride: apiKey,
      });
      return {
        data: parseAiJson(response),
        usage:
          provider === "anthropic"
            ? extractAnthropicUsage(response, model)
            : provider === "gemini"
              ? extractGeminiUsage(response, model)
              : extractOpenAiUsage(response, model),
      };
    } catch (error) {
      if (attempt >= maxRetries) throw error;
      await sleep(1000);
    }
  }

  throw new Error("Unreachable");
}

export async function generateBoard(args: {
  boardSet: BenchmarkBoardSet;
  workflow: BenchmarkWorkflow;
  dotenvValues: Record<string, string>;
  configDir: string;
  sharedThrottle?: RequestThrottler;
  sharedRequestLimiter?: AsyncLimiter;
  activeRequestTracker?: ActiveRequestTracker;
}) {
  const {
    boardSet,
    workflow,
    dotenvValues,
    configDir,
    sharedThrottle,
    sharedRequestLimiter,
    activeRequestTracker,
  } = args;

  const boardSetId = requireBenchmarkString(boardSet.board_id, "board_set.board_id");
  const categories = normalizeBoardSetCategories(boardSetId, boardSet.categories);

  const workflowName = requireBenchmarkString(workflow.name, "workflow.name");
  const provider = workflow.provider;
  const model = requireBenchmarkString(workflow.model, "workflow.model");
  const inferredProvider = resolveProviderForModel(model);
  if (provider !== inferredProvider) {
    throw new Error(
      `Workflow ${workflowName} provider/model mismatch: provider=${provider} model=${model} resolves to ${inferredProvider}.`,
    );
  }

  const apiKeyName = getApiKeyNameForProvider(provider);
  const apiKey = getConfigValue(apiKeyName, dotenvValues);
  if (!apiKey) {
    throw new Error(`${apiKeyName} not found in env or .env`);
  }

  const systemPrompt = String(
    workflow.system_prompt ?? "Return only valid JSON. No markdown.",
  ).trim();
  const maxOutputTokens = Number(workflow.max_output_tokens ?? DEFAULT_MAX_OUTPUT_TOKENS);
  const maxRetries = Number(workflow.max_retries ?? DEFAULT_MAX_RETRIES);
  const reasoningEffort = (workflow.reasoning_effort ?? "off") as ReasoningEffort;
  const throttle =
    sharedThrottle ??
    makeRequestThrottler(workflow.request_spacing_seconds ?? DEFAULT_REQUEST_SPACING_SECONDS);
  const requestLimiter =
    sharedRequestLimiter ??
    createAsyncLimiter(Math.max(1, Number(workflow.max_concurrency ?? DEFAULT_MAX_CONCURRENCY)));
  const tracker = activeRequestTracker ?? createActiveRequestTracker();

  const jobs = buildBoardGenerationJobs(categories, workflow, configDir);

  const results: BoardGenerationResult[] = await Promise.all(
    jobs.map(async (job) => {
      const queuedAt = Date.now();
      return requestLimiter(async () => {
        const startedAt = Date.now();
        const started = tracker.start();
        if (REQUEST_DEBUG) {
          console.log(
            `[request:start] workflow=${workflowName} board=${boardSetId} section=${job.section} category=${job.categoryName} active=${started.active} max=${started.maxSeen}`,
          );
        }

        const raw = await callProviderJson({
          provider,
          apiKey,
          model,
          systemPrompt,
          prompt: job.prompt,
          maxOutputTokens,
          maxRetries,
          reasoningEffort,
          throttle,
        });
        const finishedAt = Date.now();
        const ended = tracker.end();

        if (REQUEST_DEBUG) {
          console.log(
            `[request:end] workflow=${workflowName} board=${boardSetId} section=${job.section} category=${job.categoryName} active=${ended.active} max=${ended.maxSeen} queue_ms=${Math.max(0, startedAt - queuedAt)} service_ms=${Math.max(0, finishedAt - startedAt)}`,
          );
        }

        return {
          section: job.section,
          index: job.index,
          categoryName: job.categoryName,
          category: job.normalize(raw.data),
          usage: {
            provider,
            model,
            section: job.section,
            category_name: job.categoryName,
            ...raw.usage,
            queue_ms: Math.max(0, startedAt - queuedAt),
            service_ms: Math.max(0, finishedAt - startedAt),
            total_ms: Math.max(0, finishedAt - queuedAt),
            active_requests_at_start: started.active,
            active_requests_at_end: ended.active,
          } satisfies RequestUsage,
        };
      });
    }),
  );

  return buildGeneratedBoard({
    boardSetId,
    workflowName,
    provider,
    model,
    categories,
    results,
  });
}

export async function runBoardSetBenchmark(args: {
  boardSet: BenchmarkBoardSet;
  workflow: BenchmarkWorkflow;
  dotenvValues: Record<string, string>;
  configDir: string;
  classifierEndpoint: string;
  classifierBatchSize: number;
  outputDir: string;
  timestamp: string;
  configPath: string;
  sharedThrottle: RequestThrottler;
  sharedRequestLimiter: AsyncLimiter;
  activeRequestTracker: ActiveRequestTracker;
}): Promise<RunResult | FailedRunResult> {
  const {
    boardSet,
    workflow,
    dotenvValues,
    configDir,
    classifierEndpoint,
    classifierBatchSize,
    outputDir,
    timestamp,
    configPath,
    sharedThrottle,
    sharedRequestLimiter,
    activeRequestTracker,
  } = args;

  const workflowName = requireBenchmarkString(workflow.name, "workflow.name");
  const boardSetId = requireBenchmarkString(boardSet.board_id, "board_set.board_id");
  console.log(`Generating board for workflow=${workflowName} board_set=${boardSetId}`);

  try {
    const generationStartedAt = Date.now();
    const board = await generateBoard({
      boardSet,
      workflow,
      dotenvValues,
      configDir,
      sharedThrottle,
      sharedRequestLimiter,
      activeRequestTracker,
    });
    const generationMs = Date.now() - generationStartedAt;
    const clues = flattenBoardClues(board, boardSetId, workflowName);
    const requestUsage = board.requestUsage;

    const classifierStartedAt = Date.now();
    const scoredClues = await scoreBoardClues({
      endpoint: classifierEndpoint,
      clues,
      batchSize: classifierBatchSize,
    });
    const classifierMs = Date.now() - classifierStartedAt;

    const metrics = summarizeClassifierResults(scoredClues);
    const invalidClues = extractInvalidClueDetails(scoredClues);
    const timing = computeRunTiming({
      generationMs,
      classifierMs,
      clueCount: scoredClues.length,
      requests: requestUsage,
    });
    const runResult: RunResult = {
      workflow: workflowName,
      board_set_id: boardSetId,
      provider: board.provider,
      model: board.model,
      classifier_endpoint: classifierEndpoint,
      config_file: configPath,
      generated_at: currentTimestamp(),
      board,
      metrics,
      timing,
      usage: summarizeUsage(requestUsage),
      request_usage: requestUsage,
      scored_clues: scoredClues,
      invalid_clues: invalidClues,
      status: "success",
    };

    const { runFile } = writeSuccessfulRunArtifacts({
      outputDir,
      timestamp,
      runResult,
    });
    console.log(
      `  valid_rate=${(metrics.valid_rate * 100).toFixed(2)}% valid=${metrics.valid_clues}/${metrics.total_clues} wall=${timing.total_seconds}s gen=${timing.generation_seconds}s cls=${timing.classifier_seconds}s q_avg=${timing.avg_request_queue_ms ?? "n/a"}ms svc_avg=${timing.avg_request_service_ms ?? "n/a"}ms max_active=${timing.max_active_requests_seen ?? "n/a"} cps=${timing.clues_per_second} tokens=${runResult.usage.total_tokens} cost=${runResult.usage.cost_usd ?? "n/a"} saved=${path.basename(runFile)}`,
    );
    return runResult;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const failedRun: FailedRunResult = {
      workflow: workflowName,
      board_set_id: boardSetId,
      provider: workflow.provider,
      model: workflow.model,
      classifier_endpoint: classifierEndpoint,
      config_file: configPath,
      generated_at: currentTimestamp(),
      status: "failed",
      error: message,
    };
    const failedFile = writeFailedRunArtifact({
      outputDir,
      timestamp,
      failedRun,
    });
    console.log(`  failed error=${message} saved=${path.basename(failedFile)}`);
    return failedRun;
  }
}

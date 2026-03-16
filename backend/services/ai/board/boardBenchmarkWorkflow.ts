import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

import type { Provider } from "../../../../shared/models.js";
import {
  type BenchmarkPromptWorkflow,
} from "./boardPromptTemplates.js";
import {
  buildBoardGenerationJobs,
  buildGeneratedBoard,
  normalizeBoardSetCategories,
  type BoardGenerationResult,
} from "./boardBenchmarkGeneration.js";
import {
  flattenBoardClues,
  scoreBoardClues,
} from "./boardBenchmarkClassifier.js";
import {
  writeBenchmarkSummaryArtifact,
  writeFailedRunArtifact,
  writeSuccessfulRunArtifacts,
} from "./boardBenchmarkArtifacts.js";
import {
  buildBenchmarkSummary,
  computeRunTiming,
  extractAnthropicUsage,
  extractInvalidClueDetails,
  extractOpenAiUsage,
  summarizeClassifierResults,
  summarizeUsage,
} from "./boardBenchmarkWorkflow.summary.js";
import type {
  AnyRunResult,
  FailedRunResult,
  RequestUsage,
  RequestUsageCore,
  RunResult,
} from "./boardBenchmarkWorkflow.types.js";
import {
  callAiJson,
  parseAiJson,
  resolveProviderForModel,
  type ReasoningEffort,
} from "../aiClients/index.js";

const DEFAULT_CONFIG_FILE = "board_benchmark_config.json";
const DEFAULT_DOTENV_FILE = ".env";
const DEFAULT_OUTPUT_DIR = "board_benchmark_runs";
const DEFAULT_CLASSIFIER_ENDPOINT = "http://127.0.0.1:8003/validate";
const DEFAULT_CLASSIFIER_BATCH_SIZE = 50;
const DEFAULT_MAX_OUTPUT_TOKENS = 4000;
const DEFAULT_MAX_RETRIES = 2;
const DEFAULT_MAX_CONCURRENCY = 64;
const DEFAULT_REQUEST_SPACING_SECONDS = 0;

type BenchmarkBoardSet = {
  board_id: string;
  categories: string[];
};

type BenchmarkConfig = {
  classifier_endpoint?: string;
  classifier_batch_size?: number;
  output_dir?: string;
  random_seed?: number;
  category_pool?: string[];
  board_sets?: BenchmarkBoardSet[];
  workflows: BenchmarkWorkflow[];
};

type BenchmarkWorkflow = BenchmarkPromptWorkflow & {
  name: string;
  provider: Provider;
  model: string;
  board_sets?: BenchmarkBoardSet[];
  board_count?: number;
  category_pool?: string[];
  random_seed_offset?: number;
  system_prompt?: string;
  max_output_tokens?: number;
  max_retries?: number;
  max_concurrency?: number;
  request_spacing_seconds?: number;
};

export { extractOpenAiUsage, summarizeClassifierResults, summarizeUsage };

const REQUEST_DEBUG = process.env.BENCHMARK_REQUEST_DEBUG === "1";

function parseCliArgs(argv: string[]) {
  let config = DEFAULT_CONFIG_FILE;
  let dotenvFile = DEFAULT_DOTENV_FILE;

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--config") {
      config = argv[index + 1] ?? config;
      index += 1;
    } else if (arg === "--dotenv-file") {
      dotenvFile = argv[index + 1] ?? dotenvFile;
      index += 1;
    }
  }

  return { config, dotenvFile };
}

function loadJsonFile<T>(filePath: string): T {
  return JSON.parse(fs.readFileSync(filePath, "utf8")) as T;
}

function parseDotenv(filePath: string) {
  if (!fs.existsSync(filePath)) return {} as Record<string, string>;

  const values: Record<string, string> = {};
  for (const line of fs.readFileSync(filePath, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const equalsIndex = trimmed.indexOf("=");
    if (equalsIndex === -1) continue;
    const key = trimmed.slice(0, equalsIndex).trim();
    const value = trimmed
      .slice(equalsIndex + 1)
      .trim()
      .replace(/^['"]|['"]$/g, "");
    values[key] = value;
  }
  return values;
}

export function getApiKeyNameForProvider(provider: Provider) {
  if (provider === "openai") return "OPENAI_API_KEY";
  if (provider === "anthropic") return "ANTHROPIC_API_KEY";
  return "DEEPSEEK_API_KEY";
}

function getConfigValue(name: string, dotenvValues: Record<string, string>, fallback?: string) {
  return process.env[name] ?? dotenvValues[name] ?? fallback;
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function timestampId(date = new Date()) {
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}-${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`;
}

function currentTimestamp(date = new Date()) {
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

function requireString(value: unknown, label: string) {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`${label} must be a non-empty string.`);
  }
  return value.trim();
}

function makeRequestThrottler(spacingSeconds: number) {
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

async function callProviderJson(args: {
  provider: Provider;
  apiKey: string;
  model: string;
  systemPrompt: string;
  prompt: string;
  maxOutputTokens: number;
  maxRetries: number;
  reasoningEffort?: ReasoningEffort;
  throttle: () => Promise<void>;
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
            : extractOpenAiUsage(response, model),
      };
    } catch (error) {
      if (attempt >= maxRetries) throw error;
      await sleep(1000);
    }
  }

  throw new Error("Unreachable");
}

function createAsyncLimiter(concurrency: number) {
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

function createActiveRequestTracker() {
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

export function chooseBoardSetsForWorkflow(
  config: BenchmarkConfig,
  workflow: BenchmarkWorkflow,
  workflowIndex: number,
) {
  const workflowName = requireString(workflow.name, "workflow.name");
  const workflowBoardSets = workflow.board_sets;
  const globalBoardSets = config.board_sets;
  const boardCountRaw = workflow.board_count;

  if (workflowBoardSets != null) {
    if (!Array.isArray(workflowBoardSets) || workflowBoardSets.length === 0) {
      throw new Error(`${workflowName}.board_sets must be a non-empty array when provided.`);
    }
    if (boardCountRaw == null) {
      return workflowBoardSets;
    }
    const boardCount = Math.max(0, Number(boardCountRaw));
    if (workflowBoardSets.length < boardCount) {
      throw new Error(
        `${workflowName} requested ${boardCount} boards but only defined ${workflowBoardSets.length} board_sets.`,
      );
    }
    return workflowBoardSets.slice(0, boardCount);
  }

  if (boardCountRaw == null) {
    if (!Array.isArray(globalBoardSets) || globalBoardSets.length === 0) {
      throw new Error(
        "Config must include board_sets or each workflow must specify board_count with a category_pool.",
      );
    }
    return globalBoardSets;
  }

  const categoryPool = workflow.category_pool ?? config.category_pool;
  if (!Array.isArray(categoryPool) || categoryPool.length < 11) {
    throw new Error(
      `${workflowName} requires a category_pool with at least 11 categories when using board_count.`,
    );
  }

  const cleanedPool = categoryPool.map((item, index) =>
    requireString(item, `${workflowName}.category_pool[${index}]`),
  );
  const dedupedPool = Array.from(new Set(cleanedPool));
  if (dedupedPool.length < 11) {
    throw new Error(`${workflowName} category_pool must contain at least 11 unique categories.`);
  }

  const boardCount = Math.max(0, Number(boardCountRaw));
  const seedBase = Number(config.random_seed ?? 0);
  const seedOffset = Number(workflow.random_seed_offset ?? workflowIndex * 1000);
  const rng = createSeededRandom(seedBase + seedOffset);

  const generated: BenchmarkBoardSet[] = [];
  for (let boardNumber = 1; boardNumber <= boardCount; boardNumber += 1) {
    generated.push({
      board_id: `${workflowName}_${String(boardNumber).padStart(3, "0")}`,
      categories: sampleWithoutReplacement(dedupedPool, 11, rng),
    });
  }
  return generated;
}

function createSeededRandom(seed: number) {
  let state = seed >>> 0 || 1;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}

function sampleWithoutReplacement<T>(items: T[], count: number, rng: () => number) {
  const pool = items.slice();
  for (let index = pool.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(rng() * (index + 1));
    [pool[index], pool[swapIndex]] = [pool[swapIndex], pool[index]];
  }
  return pool.slice(0, count);
}

async function generateBoard(
  boardSet: BenchmarkBoardSet,
  workflow: BenchmarkWorkflow,
  dotenvValues: Record<string, string>,
  configDir: string,
  sharedThrottle?: () => Promise<void>,
  sharedRequestLimiter?: <T>(task: () => Promise<T>) => Promise<T>,
  activeRequestTracker?: ReturnType<typeof createActiveRequestTracker>,
) {
  const boardSetId = requireString(boardSet.board_id, "board_set.board_id");
  const categories = normalizeBoardSetCategories(boardSetId, boardSet.categories);

  const workflowName = requireString(workflow.name, "workflow.name");
  const provider = workflow.provider;
  const model = requireString(workflow.model, "workflow.model");
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
          category: job.normalizer(raw.data),
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
    const workflowName = requireString(workflow.name, "workflow.name");
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
      boardSets.map(async (boardSet) => {
        const boardSetId = requireString(boardSet.board_id, "board_set.board_id");
        console.log(`Generating board for workflow=${workflowName} board_set=${boardSetId}`);

        try {
          const generationStartedAt = Date.now();
          const board = await generateBoard(
            boardSet,
            workflow,
            dotenvValues,
            configDir,
            workflowThrottle,
            workflowRequestLimiter,
            workflowActiveRequestTracker,
          );
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
      }),
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

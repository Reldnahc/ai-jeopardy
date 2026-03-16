import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

import type { Provider } from "../../../../shared/models.js";
import {
  buildCategoryPromptFromWorkflow,
  buildFinalPromptFromWorkflow,
  type BenchmarkPromptWorkflow,
  valuesFor,
} from "./boardPromptTemplates.js";
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

type RegularClue = {
  value: number;
  question: string;
  answer: string;
  category: string;
};

type RegularCategory = {
  category: string;
  values: RegularClue[];
};

type FinalCategory = {
  category: string;
  values: [RegularClue];
};

type BenchmarkBoard = {
  board_set_id: string;
  workflow: string;
  provider: Provider;
  model: string;
  categories: string[];
  firstBoard: { categories: RegularCategory[] };
  secondBoard: { categories: RegularCategory[] };
  finalJeopardy: { categories: FinalCategory[] };
};

type FlattenedClue = {
  board_set_id: string;
  workflow: string;
  board_type: "firstBoard" | "secondBoard" | "finalJeopardy";
  category_index: number;
  clue_index: number;
  category: string;
  value: number;
  question: string;
  answer: string;
};

type ClassifierResult = {
  valid?: boolean;
  confidence?: number | null;
  reason?: string | null;
};

type ScoredClue = FlattenedClue & {
  classifier_valid?: boolean;
  classifier_confidence?: number | null;
  classifier_reason?: string | null;
};

type RunResult = {
  workflow: string;
  board_set_id: string;
  provider: Provider;
  model: string;
  classifier_endpoint: string;
  config_file: string;
  generated_at: string;
  board: BenchmarkBoard;
  metrics: ReturnType<typeof summarizeClassifierResults>;
  timing: RunTiming;
  usage: UsageSummary;
  request_usage: RequestUsage[];
  scored_clues: ScoredClue[];
  invalid_clues: InvalidClueDetail[];
  status: "success";
};

type FailedRunResult = {
  workflow: string;
  board_set_id: string;
  provider: Provider;
  model: string;
  classifier_endpoint: string;
  config_file: string;
  generated_at: string;
  status: "failed";
  error: string;
};

type AnyRunResult = RunResult | FailedRunResult;

type InvalidClueDetail = {
  board_type: "firstBoard" | "secondBoard" | "finalJeopardy";
  category_index: number;
  clue_index: number;
  category: string;
  value: number;
  question: string;
  answer: string;
  classifier_reason: string | null;
  classifier_confidence: number | null;
};

type RunTiming = {
  total_ms: number;
  generation_ms: number;
  classifier_ms: number;
  total_seconds: number;
  generation_seconds: number;
  classifier_seconds: number;
  clues_per_second: number;
  request_queue_ms: number;
  request_service_ms: number;
  avg_request_queue_ms: number | null;
  avg_request_service_ms: number | null;
  max_request_queue_ms: number | null;
  max_request_service_ms: number | null;
  max_active_requests_seen: number | null;
};

type RequestUsageCore = {
  provider: Provider;
  model: string;
  section: "firstBoard" | "secondBoard" | "finalJeopardy";
  category_name: string;
  prompt_tokens: number | null;
  completion_tokens: number | null;
  total_tokens: number | null;
  reasoning_tokens: number | null;
  cost_usd: number | null;
};

type RequestUsage = RequestUsageCore & {
  queue_ms: number;
  service_ms: number;
  total_ms: number;
  active_requests_at_start: number | null;
  active_requests_at_end: number | null;
};

type UsageSummary = {
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
  reasoning_tokens: number;
  requests_with_usage: number;
  requests_missing_usage: number;
  average_tokens_per_request: number | null;
  cost_usd: number | null;
};

type PriceModel = {
  inputPer1M: number;
  outputPer1M: number;
  reasoningPer1M?: number;
};

const MODEL_PRICING_USD_PER_1M: Partial<Record<string, PriceModel>> = {
  "gpt-4o-mini": { inputPer1M: 0.15, outputPer1M: 0.6 },
  "gpt-4o": { inputPer1M: 2.5, outputPer1M: 10 },
  "gpt-5-mini": { inputPer1M: 0.25, outputPer1M: 2 },
  "gpt-5.4": { inputPer1M: 2.5, outputPer1M: 15 },
  "gpt-5.2": { inputPer1M: 1.75, outputPer1M: 14 },
  "gpt-5-nano": { inputPer1M: 0.05, outputPer1M: 0.4 },
  "gpt-4.1-nano": { inputPer1M: 0.1, outputPer1M: 0.4 },
  "o1-mini": { inputPer1M: 1.1, outputPer1M: 4.4 },
  // Inference: this benchmark label is not listed verbatim on anthropic.com/pricing,
  // so use the current Claude Sonnet family base pricing.
  "claude-sonnet-4-6": { inputPer1M: 3, outputPer1M: 15 },
  "claude-haiku-4-5": { inputPer1M: 1, outputPer1M: 5 },
  "deepseek-chat": { inputPer1M: 0.28, outputPer1M: 0.42 },
  "deepseek-reasoner": { inputPer1M: 0.28, outputPer1M: 0.42 },
};

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

function saveJsonFile(filePath: string, data: unknown) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(data, null, 2)}\n`, "utf8");
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

function roundTimingMs(ms: number) {
  return Math.max(0, Math.round(ms));
}

function roundSeconds(ms: number) {
  return Number((ms / 1000).toFixed(3));
}

function computeRunTiming(args: {
  generationMs: number;
  classifierMs: number;
  clueCount: number;
  requests: RequestUsage[];
}): RunTiming {
  const generationMs = roundTimingMs(args.generationMs);
  const classifierMs = roundTimingMs(args.classifierMs);
  const totalMs = generationMs + classifierMs;
  const queueMs = args.requests.reduce((sum, request) => sum + request.queue_ms, 0);
  const serviceMs = args.requests.reduce((sum, request) => sum + request.service_ms, 0);
  const requestCount = args.requests.length;
  const maxQueueMs =
    requestCount > 0 ? Math.max(...args.requests.map((request) => request.queue_ms)) : null;
  const maxServiceMs =
    requestCount > 0 ? Math.max(...args.requests.map((request) => request.service_ms)) : null;
  const maxActiveRequestsSeen =
    requestCount > 0
      ? Math.max(
          ...args.requests.flatMap((request) =>
            [request.active_requests_at_start, request.active_requests_at_end].filter(
              (value): value is number => typeof value === "number",
            ),
          ),
        )
      : null;

  return {
    total_ms: totalMs,
    generation_ms: generationMs,
    classifier_ms: classifierMs,
    total_seconds: roundSeconds(totalMs),
    generation_seconds: roundSeconds(generationMs),
    classifier_seconds: roundSeconds(classifierMs),
    clues_per_second: totalMs > 0 ? Number(((args.clueCount * 1000) / totalMs).toFixed(3)) : 0,
    request_queue_ms: roundTimingMs(queueMs),
    request_service_ms: roundTimingMs(serviceMs),
    avg_request_queue_ms: requestCount > 0 ? Number((queueMs / requestCount).toFixed(2)) : null,
    avg_request_service_ms: requestCount > 0 ? Number((serviceMs / requestCount).toFixed(2)) : null,
    max_request_queue_ms: maxQueueMs == null ? null : roundTimingMs(maxQueueMs),
    max_request_service_ms: maxServiceMs == null ? null : roundTimingMs(maxServiceMs),
    max_active_requests_seen: maxActiveRequestsSeen,
  };
}

function safeNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function firstNumber(...values: unknown[]) {
  for (const value of values) {
    const normalized = safeNumber(value);
    if (normalized != null) return normalized;
  }
  return null;
}

function estimateRequestCostUsd(args: {
  model: string;
  promptTokens: number | null;
  completionTokens: number | null;
  reasoningTokens: number | null;
}) {
  const pricing = MODEL_PRICING_USD_PER_1M[args.model];
  if (!pricing) return null;

  const promptCost = ((args.promptTokens ?? 0) / 1_000_000) * pricing.inputPer1M;
  const completionCost = ((args.completionTokens ?? 0) / 1_000_000) * pricing.outputPer1M;
  const reasoningCost =
    pricing.reasoningPer1M != null
      ? ((args.reasoningTokens ?? 0) / 1_000_000) * pricing.reasoningPer1M
      : 0;

  return Number((promptCost + completionCost + reasoningCost).toFixed(8));
}

export function summarizeUsage(requests: RequestUsage[]): UsageSummary {
  let promptTokens = 0;
  let completionTokens = 0;
  let totalTokens = 0;
  let reasoningTokens = 0;
  let requestsWithUsage = 0;
  let requestsMissingUsage = 0;
  let costKnown = true;
  let costUsd = 0;

  for (const request of requests) {
    const hasUsage =
      request.prompt_tokens != null ||
      request.completion_tokens != null ||
      request.total_tokens != null ||
      request.reasoning_tokens != null;

    if (!hasUsage) {
      requestsMissingUsage += 1;
      continue;
    }

    requestsWithUsage += 1;
    promptTokens += request.prompt_tokens ?? 0;
    completionTokens += request.completion_tokens ?? 0;
    totalTokens +=
      request.total_tokens ?? (request.prompt_tokens ?? 0) + (request.completion_tokens ?? 0);
    reasoningTokens += request.reasoning_tokens ?? 0;

    if (request.cost_usd == null) {
      costKnown = false;
    } else {
      costUsd += request.cost_usd;
    }
  }

  return {
    prompt_tokens: promptTokens,
    completion_tokens: completionTokens,
    total_tokens: totalTokens,
    reasoning_tokens: reasoningTokens,
    requests_with_usage: requestsWithUsage,
    requests_missing_usage: requestsMissingUsage,
    average_tokens_per_request:
      requestsWithUsage > 0 ? Number((totalTokens / requestsWithUsage).toFixed(2)) : null,
    cost_usd: costKnown ? Number(costUsd.toFixed(8)) : null,
  };
}

export function extractOpenAiUsage(response: unknown, model: string) {
  const root = response as {
    usage?: {
      prompt_tokens?: unknown;
      completion_tokens?: unknown;
      input_tokens?: unknown;
      output_tokens?: unknown;
      total_tokens?: unknown;
      completion_tokens_details?: { reasoning_tokens?: unknown };
      output_tokens_details?: { reasoning_tokens?: unknown };
    };
  };
  const promptTokens = firstNumber(root.usage?.input_tokens, root.usage?.prompt_tokens);
  const completionTokens = firstNumber(root.usage?.output_tokens, root.usage?.completion_tokens);
  const totalTokens = safeNumber(root.usage?.total_tokens);
  const reasoningTokens = firstNumber(
    root.usage?.output_tokens_details?.reasoning_tokens,
    root.usage?.completion_tokens_details?.reasoning_tokens,
  );

  return {
    prompt_tokens: promptTokens,
    completion_tokens: completionTokens,
    total_tokens: totalTokens,
    reasoning_tokens: reasoningTokens,
    cost_usd: estimateRequestCostUsd({
      model,
      promptTokens,
      completionTokens,
      reasoningTokens,
    }),
  };
}

function extractAnthropicUsage(response: unknown, model: string) {
  const root = response as {
    usage?: {
      input_tokens?: unknown;
      output_tokens?: unknown;
      cache_creation_input_tokens?: unknown;
      cache_read_input_tokens?: unknown;
    };
  };
  const promptTokens =
    (safeNumber(root.usage?.input_tokens) ?? 0) +
    (safeNumber(root.usage?.cache_creation_input_tokens) ?? 0) +
    (safeNumber(root.usage?.cache_read_input_tokens) ?? 0);
  const completionTokens = safeNumber(root.usage?.output_tokens);
  const totalTokens = promptTokens + (completionTokens ?? 0);

  return {
    prompt_tokens: promptTokens,
    completion_tokens: completionTokens,
    total_tokens: totalTokens,
    reasoning_tokens: null,
    cost_usd: estimateRequestCostUsd({
      model,
      promptTokens,
      completionTokens,
      reasoningTokens: null,
    }),
  };
}

function requireString(value: unknown, label: string) {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`${label} must be a non-empty string.`);
  }
  return value.trim();
}

function normalizeRegularCategory(data: unknown, expectedValues: number[]): RegularCategory {
  if (!data || typeof data !== "object") {
    throw new Error("Regular category response must be a JSON object.");
  }

  const record = data as { category?: unknown; values?: unknown };
  const category = requireString(record.category, "category");
  if (!Array.isArray(record.values) || record.values.length !== 5) {
    throw new Error("Regular category must contain exactly 5 values.");
  }

  return {
    category,
    values: record.values.map((clue, index) => {
      if (!clue || typeof clue !== "object") {
        throw new Error(`Clue ${index} must be a JSON object.`);
      }
      const typed = clue as { value?: unknown; question?: unknown; answer?: unknown };
      if (typed.value !== expectedValues[index]) {
        throw new Error(
          `Clue ${index} value must be ${expectedValues[index]}, got ${String(typed.value)}.`,
        );
      }
      return {
        value: expectedValues[index],
        question: requireString(typed.question, `clue ${index} question`),
        answer: requireString(typed.answer, `clue ${index} answer`),
        category,
      };
    }),
  };
}

function normalizeFinalCategory(data: unknown): FinalCategory {
  if (!data || typeof data !== "object") {
    throw new Error("Final category response must be a JSON object.");
  }

  const record = data as { category?: unknown; values?: unknown };
  const category = requireString(record.category, "category");
  if (!Array.isArray(record.values) || record.values.length !== 1) {
    throw new Error("Final category must contain exactly 1 clue.");
  }

  const clue = record.values[0];
  if (!clue || typeof clue !== "object") {
    throw new Error("Final clue must be a JSON object.");
  }

  const typed = clue as { question?: unknown; answer?: unknown };
  return {
    category,
    values: [
      {
        value: 0,
        question: requireString(typed.question, "final clue question"),
        answer: requireString(typed.answer, "final clue answer"),
        category,
      },
    ],
  };
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

function classifierBatches<T>(items: T[], batchSize: number) {
  const batches: T[][] = [];
  for (let index = 0; index < items.length; index += batchSize) {
    batches.push(items.slice(index, index + batchSize));
  }
  return batches;
}

async function callClassifier(endpoint: string, clues: FlattenedClue[]) {
  const payload = clues.map((clue) => ({
    category: clue.category,
    question: clue.question,
    answer: clue.answer,
  }));

  const response = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!response.ok) {
    throw new Error(`Classifier request failed with status ${response.status}.`);
  }

  const parsed = (await response.json()) as unknown;
  if (!Array.isArray(parsed) || parsed.length !== clues.length) {
    throw new Error("Classifier returned an invalid response.");
  }
  return parsed as ClassifierResult[];
}

function flattenBoardClues(board: BenchmarkBoard, boardSetId: string, workflowName: string) {
  const clues: FlattenedClue[] = [];

  for (const sectionName of ["firstBoard", "secondBoard", "finalJeopardy"] as const) {
    const categories = board[sectionName].categories;
    categories.forEach((category, categoryIndex) => {
      category.values.forEach((clue, clueIndex) => {
        clues.push({
          board_set_id: boardSetId,
          workflow: workflowName,
          board_type: sectionName,
          category_index: categoryIndex,
          clue_index: clueIndex,
          category: clue.category,
          value: clue.value,
          question: clue.question,
          answer: clue.answer,
        });
      });
    });
  }

  return clues;
}

export function summarizeClassifierResults(scoredClues: ScoredClue[]) {
  const total = scoredClues.length;
  const validCount = scoredClues.filter((item) => item.classifier_valid === true).length;
  const invalidCount = total - validCount;
  const confidences = scoredClues
    .map((item) => item.classifier_confidence)
    .filter((value): value is number => typeof value === "number");

  const invalidReasonCounts = scoredClues.reduce<Record<string, number>>((acc, item) => {
    if (item.classifier_valid !== false || item.classifier_reason == null) {
      return acc;
    }
    const key = String(item.classifier_reason);
    acc[key] = (acc[key] ?? 0) + 1;
    return acc;
  }, {});

  const byBoardType = (["firstBoard", "secondBoard", "finalJeopardy"] as const).reduce<
    Record<
      string,
      { total_clues: number; valid_clues: number; invalid_clues: number; valid_rate: number }
    >
  >((acc, boardType) => {
    const items = scoredClues.filter((item) => item.board_type === boardType);
    const boardValid = items.filter((item) => item.classifier_valid === true).length;
    acc[boardType] = {
      total_clues: items.length,
      valid_clues: boardValid,
      invalid_clues: items.length - boardValid,
      valid_rate: items.length ? Number((boardValid / items.length).toFixed(4)) : 0,
    };
    return acc;
  }, {});

  return {
    total_clues: total,
    valid_clues: validCount,
    invalid_clues: invalidCount,
    valid_rate: total ? Number((validCount / total).toFixed(4)) : 0,
    average_confidence: confidences.length
      ? Number((confidences.reduce((sum, value) => sum + value, 0) / confidences.length).toFixed(4))
      : null,
    invalid_reason_counts: invalidReasonCounts,
    by_board_type: byBoardType,
  };
}

function extractInvalidClueDetails(scoredClues: ScoredClue[]): InvalidClueDetail[] {
  return scoredClues
    .filter((item) => item.classifier_valid === false)
    .map((item) => ({
      board_type: item.board_type,
      category_index: item.category_index,
      clue_index: item.clue_index,
      category: item.category,
      value: item.value,
      question: item.question,
      answer: item.answer,
      classifier_reason: item.classifier_reason ?? null,
      classifier_confidence: item.classifier_confidence ?? null,
    }));
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

function buildSummary(
  runResults: AnyRunResult[],
  workflowTimingByName: Record<string, { wall_clock_ms: number }>,
) {
  const successfulRuns = runResults.filter((run): run is RunResult => run.status === "success");
  const failedRuns = runResults.filter((run): run is FailedRunResult => run.status === "failed");

  const runs = successfulRuns
    .map((run) => ({
      workflow: run.workflow,
      board_set_id: run.board_set_id,
      provider: run.provider,
      model: run.model,
      valid_rate: run.metrics.valid_rate,
      valid_clues: run.metrics.valid_clues,
      invalid_clues: run.metrics.invalid_clues,
      average_confidence: run.metrics.average_confidence,
      timing: run.timing,
      usage: run.usage,
      invalid_examples: run.invalid_clues.slice(0, 5),
    }))
    .sort(
      (a, b) =>
        b.valid_rate - a.valid_rate ||
        (b.average_confidence ?? Number.NEGATIVE_INFINITY) -
          (a.average_confidence ?? Number.NEGATIVE_INFINITY),
    );

  const groupedRuns = new Map<string, RunResult[]>();
  const groupedClues = new Map<string, ScoredClue[]>();

  for (const run of successfulRuns) {
    const runsForWorkflow = groupedRuns.get(run.workflow) ?? [];
    runsForWorkflow.push(run);
    groupedRuns.set(run.workflow, runsForWorkflow);

    const cluesForWorkflow = groupedClues.get(run.workflow) ?? [];
    cluesForWorkflow.push(...run.scored_clues);
    groupedClues.set(run.workflow, cluesForWorkflow);
  }

  const workflowLeaderboard = Array.from(groupedClues.entries())
    .map(([workflowName, clues]) => {
      const metrics = summarizeClassifierResults(clues);
      const workflowRuns = groupedRuns.get(workflowName) ?? [];
      const sampleRun = workflowRuns[0];
      if (!sampleRun) {
        throw new Error(`Missing sample run for workflow ${workflowName}`);
      }
      const totalMs = workflowRuns.reduce((sum, run) => sum + run.timing.total_ms, 0);
      const generationMs = workflowRuns.reduce((sum, run) => sum + run.timing.generation_ms, 0);
      const classifierMs = workflowRuns.reduce((sum, run) => sum + run.timing.classifier_ms, 0);
      const requestQueueMs = workflowRuns.reduce(
        (sum, run) => sum + run.timing.request_queue_ms,
        0,
      );
      const requestServiceMs = workflowRuns.reduce(
        (sum, run) => sum + run.timing.request_service_ms,
        0,
      );
      const wallClockMs = workflowTimingByName[workflowName]?.wall_clock_ms ?? totalMs;
      const requestCount = workflowRuns.reduce((sum, run) => sum + run.request_usage.length, 0);
      const maxActiveRequestsSeen =
        requestCount > 0
          ? Math.max(...workflowRuns.map((run) => run.timing.max_active_requests_seen ?? 0))
          : null;
      const usage = summarizeUsage(workflowRuns.flatMap((run) => run.request_usage));
      return {
        workflow: workflowName,
        provider: sampleRun.provider,
        model: sampleRun.model,
        boards_generated: workflowRuns.length,
        valid_rate: metrics.valid_rate,
        valid_clues: metrics.valid_clues,
        invalid_clues: metrics.invalid_clues,
        average_confidence: metrics.average_confidence,
        invalid_reason_counts: metrics.invalid_reason_counts,
        by_board_type: metrics.by_board_type,
        timing: {
          total_ms: wallClockMs,
          generation_ms: generationMs,
          classifier_ms: classifierMs,
          total_seconds: Number((wallClockMs / 1000).toFixed(3)),
          generation_seconds: Number((generationMs / 1000).toFixed(3)),
          classifier_seconds: Number((classifierMs / 1000).toFixed(3)),
          clues_per_second:
            wallClockMs > 0 ? Number(((clues.length * 1000) / wallClockMs).toFixed(3)) : 0,
          request_queue_ms: requestQueueMs,
          request_service_ms: requestServiceMs,
          avg_request_queue_ms:
            requestCount > 0 ? Number((requestQueueMs / requestCount).toFixed(2)) : null,
          avg_request_service_ms:
            requestCount > 0 ? Number((requestServiceMs / requestCount).toFixed(2)) : null,
          max_request_queue_ms:
            requestCount > 0
              ? Math.max(
                  ...workflowRuns.flatMap((run) =>
                    run.request_usage.map((request) => request.queue_ms),
                  ),
                )
              : null,
          max_request_service_ms:
            requestCount > 0
              ? Math.max(
                  ...workflowRuns.flatMap((run) =>
                    run.request_usage.map((request) => request.service_ms),
                  ),
                )
              : null,
          max_active_requests_seen: maxActiveRequestsSeen,
        },
        usage,
        invalid_examples: clues
          .filter((item) => item.classifier_valid === false)
          .slice(0, 10)
          .map((item) => ({
            board_set_id: item.board_set_id,
            board_type: item.board_type,
            category: item.category,
            value: item.value,
            question: item.question,
            answer: item.answer,
            classifier_reason: item.classifier_reason ?? null,
            classifier_confidence: item.classifier_confidence ?? null,
          })),
      };
    })
    .sort(
      (a, b) =>
        b.valid_rate - a.valid_rate ||
        (b.average_confidence ?? Number.NEGATIVE_INFINITY) -
          (a.average_confidence ?? Number.NEGATIVE_INFINITY),
    );

  return {
    workflow_leaderboard: workflowLeaderboard,
    runs,
    failed_runs: failedRuns,
    success_count: successfulRuns.length,
    failure_count: failedRuns.length,
  };
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
  if (!Array.isArray(boardSet.categories) || boardSet.categories.length !== 11) {
    throw new Error(`${boardSetId} must contain exactly 11 categories.`);
  }

  const categories = boardSet.categories.map((item, index) =>
    requireString(item, `${boardSetId}.categories[${index}]`),
  );

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

  const firstCategories = categories.slice(0, 5);
  const secondCategories = categories.slice(5, 10);
  const finalCategory = categories[10];

  const jobs = [
    ...firstCategories.map((category, index) => ({
      section: "firstBoard" as const,
      index,
      categoryName: category,
      prompt: buildCategoryPromptFromWorkflow(category, false, workflow, configDir),
      normalizer: (data: unknown) => normalizeRegularCategory(data, valuesFor(false)),
    })),
    ...secondCategories.map((category, index) => ({
      section: "secondBoard" as const,
      index,
      categoryName: category,
      prompt: buildCategoryPromptFromWorkflow(category, true, workflow, configDir),
      normalizer: (data: unknown) => normalizeRegularCategory(data, valuesFor(true)),
    })),
    {
      section: "finalJeopardy" as const,
      index: 0,
      categoryName: finalCategory,
      prompt: buildFinalPromptFromWorkflow(finalCategory, workflow, configDir),
      normalizer: normalizeFinalCategory,
    },
  ];

  const sections: {
    firstBoard: RegularCategory[];
    secondBoard: RegularCategory[];
    finalJeopardy: FinalCategory[];
  } = {
    firstBoard: new Array<RegularCategory>(5),
    secondBoard: new Array<RegularCategory>(5),
    finalJeopardy: new Array<FinalCategory>(1),
  };

  const results = await Promise.all(
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

  for (const result of results) {
    if (result.section === "finalJeopardy") {
      sections.finalJeopardy[result.index] = result.category as FinalCategory;
    } else if (result.section === "firstBoard") {
      sections.firstBoard[result.index] = result.category as RegularCategory;
    } else {
      sections.secondBoard[result.index] = result.category as RegularCategory;
    }
  }

  return {
    board_set_id: boardSetId,
    workflow: workflowName,
    provider,
    model,
    categories,
    firstBoard: { categories: sections.firstBoard },
    secondBoard: { categories: sections.secondBoard },
    finalJeopardy: { categories: sections.finalJeopardy },
    requestUsage: results.map((result) => result.usage),
  } satisfies BenchmarkBoard & { requestUsage: RequestUsage[] };
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
          const scoredClues: ScoredClue[] = [];

          const classifierStartedAt = Date.now();
          for (const batch of classifierBatches(clues, classifierBatchSize)) {
            const results = await callClassifier(classifierEndpoint, batch);
            batch.forEach((clue, index) => {
              const result = results[index];
              scoredClues.push({
                ...clue,
                classifier_valid: result.valid,
                classifier_confidence: result.confidence ?? null,
                classifier_reason: result.reason ?? null,
              });
            });
          }
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

          const runFile = path.join(outputDir, `${timestamp}_${workflowName}_${boardSetId}.json`);
          const invalidFile = path.join(
            outputDir,
            `${timestamp}_${workflowName}_${boardSetId}_invalid.json`,
          );
          saveJsonFile(runFile, runResult);
          saveJsonFile(invalidFile, {
            workflow: workflowName,
            board_set_id: boardSetId,
            invalid_clue_count: invalidClues.length,
            timing,
            usage: runResult.usage,
            request_usage: requestUsage,
            invalid_clues: invalidClues,
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
          const failedFile = path.join(
            outputDir,
            `${timestamp}_${workflowName}_${boardSetId}_failed.json`,
          );
          saveJsonFile(failedFile, failedRun);
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
    summary: buildSummary(runResults, workflowTimingByName),
  };
  saveJsonFile(path.join(outputDir, `${timestamp}_summary.json`), summary);
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

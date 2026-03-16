import fs from "node:fs";

import type { Provider } from "../../../../shared/models.js";
import type { BenchmarkPromptWorkflow } from "./boardPromptTemplates.js";

export const DEFAULT_CONFIG_FILE = "board_benchmark_config.json";
export const DEFAULT_DOTENV_FILE = ".env";
export const DEFAULT_OUTPUT_DIR = "board_benchmark_runs";
export const DEFAULT_CLASSIFIER_ENDPOINT = "http://127.0.0.1:8003/validate";
export const DEFAULT_CLASSIFIER_BATCH_SIZE = 50;
export const DEFAULT_MAX_OUTPUT_TOKENS = 4000;
export const DEFAULT_MAX_RETRIES = 2;
export const DEFAULT_MAX_CONCURRENCY = 64;
export const DEFAULT_REQUEST_SPACING_SECONDS = 0;

export type BenchmarkBoardSet = {
  board_id: string;
  categories: string[];
};

export type BenchmarkConfig = {
  classifier_endpoint?: string;
  classifier_batch_size?: number;
  output_dir?: string;
  random_seed?: number;
  category_pool?: string[];
  board_sets?: BenchmarkBoardSet[];
  workflows: BenchmarkWorkflow[];
};

export type BenchmarkWorkflow = BenchmarkPromptWorkflow & {
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

export function parseCliArgs(argv: string[]) {
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

export function loadJsonFile<T>(filePath: string): T {
  return JSON.parse(fs.readFileSync(filePath, "utf8")) as T;
}

export function parseDotenv(filePath: string) {
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

export function getConfigValue(
  name: string,
  dotenvValues: Record<string, string>,
  fallback?: string,
) {
  return process.env[name] ?? dotenvValues[name] ?? fallback;
}

export function timestampId(date = new Date()) {
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}-${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`;
}

export function currentTimestamp(date = new Date()) {
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

export function requireBenchmarkString(value: unknown, label: string) {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`${label} must be a non-empty string.`);
  }
  return value.trim();
}

export function chooseBoardSetsForWorkflow(
  config: BenchmarkConfig,
  workflow: BenchmarkWorkflow,
  workflowIndex: number,
) {
  const workflowName = requireBenchmarkString(workflow.name, "workflow.name");
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
    requireBenchmarkString(item, `${workflowName}.category_pool[${index}]`),
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

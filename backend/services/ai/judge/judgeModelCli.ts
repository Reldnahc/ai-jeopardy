import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { appConfig } from "../../../config/appConfig.js";
import { summarizeAiUsage } from "../usage.js";
import { judgeClueAnswerWithModelDetailed } from "./judgeText.js";
import type { Verdict } from "./types.js";

const DEFAULT_CASES_FILE = "backend/services/ai/judge/judgeModelCases.example.json";
const DEFAULT_CONCURRENCY = 8;
const DEFAULT_OUTPUT_DIR = "judge_case_runs";

export type JudgeCase = {
  name?: string;
  category: string;
  question: string;
  expectedAnswer: string;
  transcript: string;
  expectedVerdict?: Verdict;
};

export function normalizeJudgeModel(model?: string) {
  const trimmed = String(model ?? "").trim();
  return trimmed || appConfig.ai.judgeModel;
}

export function normalizeConcurrency(value: unknown) {
  const numeric = Math.trunc(Number(value));
  if (!Number.isFinite(numeric) || numeric < 1) {
    return DEFAULT_CONCURRENCY;
  }
  return numeric;
}

export function parseCliArgs(argv: string[]) {
  let casesFile = DEFAULT_CASES_FILE;
  let concurrency = DEFAULT_CONCURRENCY;
  let outputDir = DEFAULT_OUTPUT_DIR;

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--model") {
      index += 1;
      continue;
    }
    if (arg === "--cases") {
      casesFile = argv[index + 1] ?? casesFile;
      index += 1;
      continue;
    }
    if (arg === "--concurrency") {
      concurrency = normalizeConcurrency(argv[index + 1] ?? concurrency);
      index += 1;
      continue;
    }
    if (arg === "--output-dir") {
      outputDir = String(argv[index + 1] ?? outputDir).trim() || outputDir;
      index += 1;
    }
  }

  return { model: normalizeJudgeModel(), casesFile, concurrency, outputDir };
}

function requireString(value: unknown, label: string) {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`${label} must be a non-empty string.`);
  }
  return value.trim();
}

function requireAnyString(value: unknown, label: string) {
  if (typeof value !== "string") {
    throw new Error(`${label} must be a string.`);
  }
  return value;
}

export function loadJudgeCases(filePath: string): JudgeCase[] {
  const raw = JSON.parse(fs.readFileSync(filePath, "utf8")) as unknown;
  if (!Array.isArray(raw)) {
    throw new Error("Judge cases file must be a JSON array.");
  }

  return raw.map((item, index) => {
    if (!item || typeof item !== "object") {
      throw new Error(`Case ${index} must be a JSON object.`);
    }
    const record = item as Record<string, unknown>;
    const expectedVerdict = record.expectedVerdict;
    if (
      expectedVerdict != null &&
      expectedVerdict !== "correct" &&
      expectedVerdict !== "incorrect"
    ) {
      throw new Error(`cases[${index}].expectedVerdict must be "correct" or "incorrect".`);
    }

    return {
      name: typeof record.name === "string" ? record.name.trim() : undefined,
      category: requireString(record.category, `cases[${index}].category`),
      question: requireString(record.question, `cases[${index}].question`),
      expectedAnswer: requireString(record.expectedAnswer, `cases[${index}].expectedAnswer`),
      transcript: requireAnyString(record.transcript, `cases[${index}].transcript`),
      expectedVerdict: expectedVerdict as Verdict | undefined,
    };
  });
}

async function mapWithConcurrency<TInput, TOutput>(
  items: TInput[],
  concurrency: number,
  mapper: (item: TInput, index: number) => Promise<TOutput>,
) {
  const limit = Math.max(1, concurrency);
  const results = new Array<TOutput>(items.length);
  let nextIndex = 0;

  async function worker() {
    while (true) {
      const currentIndex = nextIndex;
      nextIndex += 1;
      if (currentIndex >= items.length) return;
      results[currentIndex] = await mapper(items[currentIndex]!, currentIndex);
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      await worker();
    }),
  );

  return results;
}

function timestampId(date = new Date()) {
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}-${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`;
}

function sanitizeFilenamePart(value: string) {
  return value.replace(/[^a-zA-Z0-9._-]+/g, "_");
}

export function buildJudgeReportPath(args: { outputDir: string; model: string; date?: Date }) {
  const stamp = timestampId(args.date);
  const modelPart = sanitizeFilenamePart(args.model);
  return path.resolve(process.cwd(), args.outputDir, `${stamp}_${modelPart}.json`);
}

function saveJsonFile(filePath: string, data: unknown) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(data, null, 2)}\n`, "utf8");
}

export async function runJudgeCases(args: {
  model: string;
  cases: JudgeCase[];
  concurrency?: number;
}) {
  const model = normalizeJudgeModel(args.model);
  const concurrency = normalizeConcurrency(args.concurrency);
  const results = await mapWithConcurrency(args.cases, concurrency, async (testCase, index) => {
    const result = await judgeClueAnswerWithModelDetailed({
      expectedAnswer: testCase.expectedAnswer,
      transcript: testCase.transcript,
      question: testCase.question,
      category: testCase.category,
      model,
    });
    const passed =
      testCase.expectedVerdict == null ? null : result.verdict === testCase.expectedVerdict;

    return {
      index,
      name: testCase.name ?? `Case ${index + 1}`,
      passed,
      verdict: result.verdict,
      path: result.diagnostics.path,
      total_ms: result.diagnostics.total_ms,
      model_ms: result.diagnostics.model_ms,
      usage: result.diagnostics.usage,
      parser_failed: result.diagnostics.parser_failed,
      expectedVerdict: testCase.expectedVerdict ?? null,
      testCase,
    };
  });

  const passCount = results.filter((item) => item.passed === true).length;
  const failCount = results.filter((item) => item.passed === false).length;
  const totalMs = Number(results.reduce((sum, item) => sum + item.total_ms, 0).toFixed(2));
  const totalModelMs = Number(
    results.reduce((sum, item) => sum + (item.model_ms ?? 0), 0).toFixed(2),
  );
  const modelCallCount = results.filter((item) => item.path === "model").length;
  const fastPathCount = results.length - modelCallCount;
  const usage = summarizeAiUsage(results.map((item) => item.usage));

  return {
    model,
    concurrency,
    total: results.length,
    passCount,
    failCount,
    total_ms: totalMs,
    total_model_ms: totalModelMs,
    average_case_ms: results.length > 0 ? Number((totalMs / results.length).toFixed(2)) : null,
    average_model_ms:
      modelCallCount > 0 ? Number((totalModelMs / modelCallCount).toFixed(2)) : null,
    model_call_count: modelCallCount,
    fast_path_count: fastPathCount,
    usage,
    results,
  };
}

export async function main(argv = process.argv.slice(2)) {
  const { model, casesFile, concurrency, outputDir } = parseCliArgs(argv);
  const resolvedCasesFile = path.resolve(process.cwd(), casesFile);
  const cases = loadJudgeCases(resolvedCasesFile);
  const summary = await runJudgeCases({ model, cases, concurrency });
  const report = {
    generated_at: new Date().toISOString(),
    model: summary.model,
    concurrency: summary.concurrency,
    cases_file: resolvedCasesFile,
    summary: {
      total: summary.total,
      passCount: summary.passCount,
      failCount: summary.failCount,
      total_ms: summary.total_ms,
      total_model_ms: summary.total_model_ms,
      average_case_ms: summary.average_case_ms,
      average_model_ms: summary.average_model_ms,
      model_call_count: summary.model_call_count,
      fast_path_count: summary.fast_path_count,
      usage: summary.usage,
    },
    results: summary.results,
  };
  const reportPath = buildJudgeReportPath({ outputDir, model: summary.model });
  saveJsonFile(reportPath, report);

  console.log(
    `Running ${summary.total} judge cases with model=${summary.model} concurrency=${summary.concurrency}`,
  );
  console.log(`Cases file: ${resolvedCasesFile}`);
  for (const item of summary.results) {
    const status = item.passed == null ? "DONE" : item.passed ? "PASS" : "FAIL";
    console.log(
      `[${status}] ${item.name} verdict=${item.verdict} expected=${item.expectedVerdict ?? "n/a"} path=${item.path} total_ms=${item.total_ms} model_ms=${item.model_ms ?? "n/a"} tokens=${item.usage?.total_tokens ?? "n/a"} cost=${item.usage?.cost_usd ?? "n/a"} parser_failed=${item.parser_failed}`,
    );
  }
  console.log(
    `Summary: pass=${summary.passCount} fail=${summary.failCount} total=${summary.total} total_ms=${summary.total_ms} avg_case_ms=${summary.average_case_ms ?? "n/a"} avg_model_ms=${summary.average_model_ms ?? "n/a"} model_calls=${summary.model_call_count} fast_paths=${summary.fast_path_count} tokens=${summary.usage.total_tokens} cost=${summary.usage.cost_usd ?? "n/a"}`,
  );
  console.log(`Report: ${reportPath}`);

  if (summary.failCount > 0) {
    process.exitCode = 1;
  }
}

const entryArg = process.argv[1] ? path.resolve(process.argv[1]) : "";
if (entryArg && import.meta.url === pathToFileURL(entryArg).href) {
  void main();
}

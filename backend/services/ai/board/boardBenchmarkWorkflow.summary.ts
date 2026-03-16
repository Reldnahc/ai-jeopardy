import type {
  AnyRunResult,
  BoardSectionName,
  FailedRunResult,
  InvalidClueDetail,
  RequestUsage,
  RunResult,
  RunTiming,
  ScoredClue,
  UsageSummary,
} from "./boardBenchmarkWorkflow.types.js";

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

function roundTimingMs(ms: number) {
  return Number(ms.toFixed(2));
}

function roundSeconds(ms: number) {
  return Number((ms / 1000).toFixed(3));
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

export function computeRunTiming(args: {
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

export function extractAnthropicUsage(response: unknown, model: string) {
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

  const byBoardType = (
    ["firstBoard", "secondBoard", "finalJeopardy"] as const
  ).reduce<
    Record<
      BoardSectionName,
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
  }, {
    firstBoard: { total_clues: 0, valid_clues: 0, invalid_clues: 0, valid_rate: 0 },
    secondBoard: { total_clues: 0, valid_clues: 0, invalid_clues: 0, valid_rate: 0 },
    finalJeopardy: { total_clues: 0, valid_clues: 0, invalid_clues: 0, valid_rate: 0 },
  });

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

export function extractInvalidClueDetails(scoredClues: ScoredClue[]): InvalidClueDetail[] {
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

export function buildBenchmarkSummary(
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

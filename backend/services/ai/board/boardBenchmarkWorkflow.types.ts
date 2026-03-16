import type { Provider } from "../../../../shared/models.js";

export type BoardSectionName = "firstBoard" | "secondBoard" | "finalJeopardy";

export type RegularClue = {
  value: number;
  question: string;
  answer: string;
  category: string;
};

export type RegularCategory = {
  category: string;
  values: RegularClue[];
};

export type FinalCategory = {
  category: string;
  values: [RegularClue];
};

export type BenchmarkBoard = {
  board_set_id: string;
  workflow: string;
  provider: Provider;
  model: string;
  categories: string[];
  firstBoard: { categories: RegularCategory[] };
  secondBoard: { categories: RegularCategory[] };
  finalJeopardy: { categories: FinalCategory[] };
};

export type FlattenedClue = {
  board_set_id: string;
  workflow: string;
  board_type: BoardSectionName;
  category_index: number;
  clue_index: number;
  category: string;
  value: number;
  question: string;
  answer: string;
};

export type ClassifierResult = {
  valid?: boolean;
  confidence?: number | null;
  reason?: string | null;
};

export type ScoredClue = FlattenedClue & {
  classifier_valid?: boolean;
  classifier_confidence?: number | null;
  classifier_reason?: string | null;
};

export type InvalidClueDetail = {
  board_type: BoardSectionName;
  category_index: number;
  clue_index: number;
  category: string;
  value: number;
  question: string;
  answer: string;
  classifier_reason: string | null;
  classifier_confidence: number | null;
};

export type RunTiming = {
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

export type RequestUsageCore = {
  provider: Provider;
  model: string;
  section: BoardSectionName;
  category_name: string;
  prompt_tokens: number | null;
  completion_tokens: number | null;
  total_tokens: number | null;
  reasoning_tokens: number | null;
  cost_usd: number | null;
};

export type RequestUsage = RequestUsageCore & {
  queue_ms: number;
  service_ms: number;
  total_ms: number;
  active_requests_at_start: number | null;
  active_requests_at_end: number | null;
};

export type UsageSummary = {
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
  reasoning_tokens: number;
  requests_with_usage: number;
  requests_missing_usage: number;
  average_tokens_per_request: number | null;
  cost_usd: number | null;
};

export type ClassifierSummary = {
  total_clues: number;
  valid_clues: number;
  invalid_clues: number;
  valid_rate: number;
  average_confidence: number | null;
  invalid_reason_counts: Record<string, number>;
  by_board_type: Record<
    BoardSectionName,
    { total_clues: number; valid_clues: number; invalid_clues: number; valid_rate: number }
  >;
};

export type RunResult = {
  workflow: string;
  board_set_id: string;
  provider: Provider;
  model: string;
  classifier_endpoint: string;
  config_file: string;
  generated_at: string;
  board: BenchmarkBoard;
  metrics: ClassifierSummary;
  timing: RunTiming;
  usage: UsageSummary;
  request_usage: RequestUsage[];
  scored_clues: ScoredClue[];
  invalid_clues: InvalidClueDetail[];
  status: "success";
};

export type FailedRunResult = {
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

export type AnyRunResult = RunResult | FailedRunResult;

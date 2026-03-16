export type Verdict = "correct" | "incorrect";

export type JudgeTextResult = { verdict: Verdict };
export type JudgeImageResult = { verdict: Verdict; transcript: string };

export type JudgeUsage = {
  prompt_tokens: number | null;
  completion_tokens: number | null;
  total_tokens: number | null;
  reasoning_tokens: number | null;
  cost_usd: number | null;
};

export type JudgeDecisionPath = "fast_accept" | "generic_reject" | "model";

export type JudgeTextDetailedResult = JudgeTextResult & {
  diagnostics: {
    path: JudgeDecisionPath;
    model: string | null;
    total_ms: number;
    model_ms: number | null;
    usage: JudgeUsage | null;
    parser_failed: boolean;
  };
};

export type JudgeStrictness = "lenient" | "standard";
export type AnswerType = "person" | "place" | "number" | "title" | "thing";

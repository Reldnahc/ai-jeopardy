export type Verdict = "correct" | "incorrect";

export type JudgeTextResult = { verdict: Verdict };
export type JudgeImageResult = { verdict: Verdict; transcript: string };

export type JudgeStrictness = "lenient" | "standard";
export type AnswerType = "person" | "place" | "number" | "title" | "thing";

import type { AnswerType } from "./types.js";

export function isTooGeneric(norm: string) {
  const bad = new Set([
    "it",
    "this",
    "that",
    "thing",
    "stuff",
    "someone",
    "somebody",
    "something",
    "anything",
    "everything",
    "idk",
    "i dont know",
    "dont know",
    "unknown",
  ]);

  if (bad.has(norm)) return true;

  // Reject 1-char garbage, but allow 2+ chars
  if (norm.length <= 1) return true;

  // Reject single-token filler verbs only if you want (optional)
  // if (norm === "go" || norm === "do" || norm === "say") return true;

  return false;
}

export function inferAnswerType(expectedAnswer: string): AnswerType {
  const a = String(expectedAnswer || "").trim();

  if (/[0-9]/.test(a)) return "number";
  if (/^["“].+["”]$/.test(a) || /^(the|a|an)\s+/i.test(a)) return "title";

  if (
    /\b(mount|mt|river|lake|sea|ocean|city|state|country|island|bay|strait|peninsula)\b/i.test(a)
  ) {
    return "place";
  }

  if (/^[A-Za-z]+(?:\s+[A-Za-z]+)+$/.test(a)) return "person";

  return "thing";
}

function stripLeadingArticle(v: string): string {
  return v.replace(/^\s*(a|an|the)\s+/i, "").trim();
}

function levenshteinDistance(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;

  const rows = a.length + 1;
  const cols = b.length + 1;
  const dp: number[][] = Array.from({ length: rows }, () => Array<number>(cols).fill(0));

  for (let i = 0; i < rows; i += 1) dp[i][0] = i;
  for (let j = 0; j < cols; j += 1) dp[0][j] = j;

  for (let i = 1; i < rows; i += 1) {
    for (let j = 1; j < cols; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1,
        dp[i][j - 1] + 1,
        dp[i - 1][j - 1] + cost,
      );
    }
  }

  return dp[a.length][b.length];
}

export function isLikelyEquivalentFast(normTranscript: string, normExpected: string): boolean {
  if (!normTranscript || !normExpected) return false;
  if (normTranscript === normExpected) return true;

  const tNoArticle = stripLeadingArticle(normTranscript);
  const aNoArticle = stripLeadingArticle(normExpected);
  if (tNoArticle && aNoArticle && tNoArticle === aNoArticle) return true;

  const tTokens = tNoArticle.split(/\s+/).filter(Boolean);
  const aTokens = aNoArticle.split(/\s+/).filter(Boolean);
  if (!tTokens.length || tTokens.length !== aTokens.length) return false;

  let mismatches = 0;
  for (let i = 0; i < tTokens.length; i += 1) {
    if (tTokens[i] === aTokens[i]) continue;
    mismatches += 1;
    const left = tTokens[i];
    const right = aTokens[i];
    if (left.length < 6 || right.length < 6) return false;
    if (levenshteinDistance(left, right) > 2) return false;
    if (mismatches > 1) return false;
  }

  return mismatches === 1;
}

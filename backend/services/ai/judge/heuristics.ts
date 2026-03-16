import type { AnswerType } from "./types.js";

const INITIALISM_STOPWORDS = new Set(["a", "an", "the", "and", "of", "for", "in", "on", "to"]);
const GENERIC_TRAILING_WORDS = new Set([
  "river",
  "desert",
  "mount",
  "mt",
  "mountain",
  "mountains",
  "sea",
  "ocean",
  "lake",
  "city",
  "country",
  "state",
  "island",
  "bay",
  "strait",
  "peninsula",
]);

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

function stripTrailingGenericWord(v: string): string {
  const tokens = v.split(/\s+/).filter(Boolean);
  if (tokens.length < 2) return v;
  const tail = tokens[tokens.length - 1];
  if (!tail || !GENERIC_TRAILING_WORDS.has(tail)) return v;
  return tokens.slice(0, -1).join(" ");
}

function collapseInitialismTokens(tokens: string[]): string | null {
  if (tokens.length < 2) return null;
  if (!tokens.every((token) => token.length === 1)) return null;
  return tokens.join("");
}

function buildInitialisms(tokens: string[]): string[] {
  if (tokens.length < 2) return [];

  const allTokens = tokens.map((token) => token[0]).join("");
  const significantTokens = tokens.filter((token) => !INITIALISM_STOPWORDS.has(token));
  const significant =
    significantTokens.length >= 2 ? significantTokens.map((token) => token[0]).join("") : null;

  return [...new Set([allTokens, significant].filter((value): value is string => Boolean(value)))];
}

function isInitialismEquivalent(leftTokens: string[], rightTokens: string[]): boolean {
  const leftCollapsed =
    collapseInitialismTokens(leftTokens) ?? (leftTokens.length === 1 ? leftTokens[0] : null);
  const rightCollapsed =
    collapseInitialismTokens(rightTokens) ?? (rightTokens.length === 1 ? rightTokens[0] : null);

  const rightHasExpandedWords = rightTokens.every((token) => token.length > 1);
  const leftHasExpandedWords = leftTokens.every((token) => token.length > 1);

  if (
    leftCollapsed &&
    (leftCollapsed.length >= 3 || (leftCollapsed.length === 2 && rightHasExpandedWords)) &&
    buildInitialisms(rightTokens).includes(leftCollapsed)
  ) {
    return true;
  }
  if (
    rightCollapsed &&
    (rightCollapsed.length >= 3 || (rightCollapsed.length === 2 && leftHasExpandedWords)) &&
    buildInitialisms(leftTokens).includes(rightCollapsed)
  ) {
    return true;
  }

  return false;
}

function stripSafePlural(token: string): string {
  if (token.length < 5) return token;
  if (token.endsWith("ies") && token.length > 5) return `${token.slice(0, -3)}y`;
  if (/(ches|shes|xes|zes|sses)$/i.test(token)) return token.slice(0, -2);
  if (token.endsWith("s") && !/(ss|us|is)$/i.test(token)) return token.slice(0, -1);
  return token;
}

function isPluralEquivalent(left: string, right: string): boolean {
  if (left === right) return true;
  const leftBase = stripSafePlural(left);
  const rightBase = stripSafePlural(right);
  return leftBase === rightBase && (leftBase !== left || rightBase !== right);
}

function isSingleAdjacentTransposition(left: string, right: string): boolean {
  if (left.length !== right.length || left.length < 4) return false;

  let mismatchIndex = -1;
  for (let i = 0; i < left.length; i += 1) {
    if (left[i] === right[i]) continue;
    mismatchIndex = i;
    break;
  }

  if (mismatchIndex < 0 || mismatchIndex >= left.length - 1) return false;

  return (
    left[mismatchIndex] === right[mismatchIndex + 1] &&
    left[mismatchIndex + 1] === right[mismatchIndex] &&
    left.slice(mismatchIndex + 2) === right.slice(mismatchIndex + 2)
  );
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
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + cost);
    }
  }

  return dp[a.length][b.length];
}

function isSafeFuzzyTokenMatch(left: string, right: string): boolean {
  if (left === right) return true;
  if (isPluralEquivalent(left, right)) return true;
  if (isSingleAdjacentTransposition(left, right)) return true;

  const minLen = Math.min(left.length, right.length);
  if (minLen < 5) return false;

  const maxDistance = minLen >= 8 ? 2 : 1;
  return levenshteinDistance(left, right) <= maxDistance;
}

function isMoreSpecificVariant(leftTokens: string[], rightTokens: string[]): boolean {
  if (leftTokens.length <= rightTokens.length) return false;
  if (rightTokens.length !== 1) return false;

  const expected = rightTokens[0];
  if (!expected || expected.length < 5) return false;

  return leftTokens[leftTokens.length - 1] === expected && leftTokens.length <= 3;
}

export function isLikelyEquivalentFast(normTranscript: string, normExpected: string): boolean {
  if (!normTranscript || !normExpected) return false;
  if (normTranscript === normExpected) return true;

  const tNoArticle = stripLeadingArticle(normTranscript);
  const aNoArticle = stripLeadingArticle(normExpected);
  if (tNoArticle && aNoArticle && tNoArticle === aNoArticle) return true;
  if (stripTrailingGenericWord(tNoArticle) === aNoArticle) return true;
  if (stripTrailingGenericWord(aNoArticle) === tNoArticle) return true;

  const tTokens = tNoArticle.split(/\s+/).filter(Boolean);
  const aTokens = aNoArticle.split(/\s+/).filter(Boolean);
  if (!tTokens.length || !aTokens.length) return false;
  if (isInitialismEquivalent(tTokens, aTokens)) return true;
  if (isMoreSpecificVariant(tTokens, aTokens)) return true;
  if (tTokens.length !== aTokens.length) return false;

  let mismatches = 0;
  for (let i = 0; i < tTokens.length; i += 1) {
    if (tTokens[i] === aTokens[i]) continue;
    mismatches += 1;
    if (!isSafeFuzzyTokenMatch(tTokens[i], aTokens[i])) return false;
    if (mismatches > 1) return false;
  }

  return mismatches > 0;
}

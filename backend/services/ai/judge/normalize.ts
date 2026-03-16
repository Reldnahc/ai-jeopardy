const TRAILING_HEDGE_PATTERN =
  /(?:\s|,)+(?:i think|i guess|maybe|perhaps|probably|i believe|i dunno|i do not know)\s*$/i;
const CORRECTION_SPLIT_PATTERN =
  /\b(?:no\s+wait|wait\s+no|actually\s+no|no,\s*wait|no|i mean|rather)\b/i;

function normalizeBasicText(s: unknown) {
  return String(s || "")
    .toLowerCase()
    .replace(/['’]/g, "")
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function stripLeadingAnswerPhrases(s: string) {
  return s
    .replace(/^\s*(what|who|where|when|which)\s+(is|are|was|were)(?:\s+|[^a-z0-9]+)+/i, "")
    .replace(
      /^\s*(there'?s|there is|the answer is|answer is|my answer is|i think the answer is|i think (it'?s|it is)|maybe (it'?s|it is)|could it be|would it be|is it|that would be)(?:\s+|[^a-z0-9]+)+/i,
      "",
    )
    .replace(
      /^\s*(it'?s|it is|it was|they are|they were|that'?s|that is|this is)(?:\s+|[^a-z0-9]+)+/i,
      "",
    );
}

function stripTrailingAnswerPhrases(s: string) {
  return s.replace(TRAILING_HEDGE_PATTERN, "").trim();
}

function collapseLeadingStutter(s: string) {
  const tokens = s.split(/\s+/).filter(Boolean);
  while (tokens.length >= 2) {
    const [first, second] = tokens;
    if (!first || !second) break;
    const third = tokens[2];
    if (
      third &&
      first === second &&
      first.length <= 3 &&
      third.length > first.length &&
      third.startsWith(first)
    ) {
      tokens.splice(0, 2);
      continue;
    }
    const shouldDropLeadingStutter =
      first.length <= 3 && second.length > first.length && second.startsWith(first);
    if (!shouldDropLeadingStutter) break;
    tokens.shift();
  }
  return tokens.join(" ");
}

function normalizeSimpleNumberWord(s: string) {
  const simpleNumberWords: Record<string, string> = {
    zero: "0",
    one: "1",
    two: "2",
    three: "3",
    four: "4",
    five: "5",
    six: "6",
    seven: "7",
    eight: "8",
    nine: "9",
    ten: "10",
    eleven: "11",
    twelve: "12",
    thirteen: "13",
    fourteen: "14",
    fifteen: "15",
    sixteen: "16",
    seventeen: "17",
    eighteen: "18",
    nineteen: "19",
    twenty: "20",
  };

  return simpleNumberWords[s] ?? s;
}

export function normalizeJeopardyText(s: unknown) {
  const basic = normalizeBasicText(s);
  const strippedLeading = stripLeadingAnswerPhrases(basic);
  const strippedTrailing = stripTrailingAnswerPhrases(strippedLeading);
  const collapsedStutter = collapseLeadingStutter(strippedTrailing);
  return normalizeSimpleNumberWord(collapsedStutter);
}

export function buildNormalizedAnswerVariants(s: unknown): string[] {
  const raw = String(s || "");
  const variants = new Set<string>();

  const normalized = normalizeJeopardyText(raw);
  if (normalized) variants.add(normalized);

  const correctionParts = raw
    .split(/[—–]/g)
    .flatMap((part) => part.split(CORRECTION_SPLIT_PATTERN))
    .map((part) => normalizeJeopardyText(part))
    .filter(Boolean);

  for (const variant of correctionParts) {
    variants.add(variant);
  }

  return [...variants];
}

export function hasAnyAlphaNum(s: string) {
  return /[a-z0-9]/i.test(s);
}

export function clampLen(s: string, max = 400) {
  const v = String(s ?? "");
  if (v.length <= max) return v;
  return v.slice(0, max) + "…";
}

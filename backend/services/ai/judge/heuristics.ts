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

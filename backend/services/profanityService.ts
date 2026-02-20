// backend/services/images/profanityService.ts
import { Filter } from "bad-words";

const filter = new Filter();

/**
 * Normalize to letters+digits (remove separators, accents).
 */
function normalizeAlnum(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]/g, "");
}

/**
 * Normalize to letters only (also removes digits).
 * This catches stuff like "fuck123" => "fuck".
 */
function normalizeLettersOnly(text: string): string {
  return normalizeAlnum(text).replace(/[0-9]/g, "");
}

/**
 * Conservative banned list for "hard block".
 * You can add/remove based on your policy.
 */
const bannedSubstrings = new Set([
  // Core profanity
  "fuck",
  "shit",
  "cunt",
  "motherfucker",
  "fucker",
  "fucking",
  "bullshit",

  // Strong insults
  "retard",
  "retarded",

  // Common hateful language (broad but important)
  "nigger",
  "nigga",
  "faggot",
  "fag",
  "kike",
  "spic",
  "chink",
  "raghead",
  "gook",
  "wetback",
]);

export function containsProfanity(text: string): boolean {
  const raw = String(text ?? "");
  if (!raw.trim()) return false;

  // 1) Normal check (handles "fuck", "shit", "f*ck" sometimes, etc.)
  if (filter.isProfane(raw)) return true;

  // 2) Alnum normalization check (handles: "f.u.c.k", "f u c k", etc.)
  const alnum = normalizeAlnum(raw);
  if (alnum && filter.isProfane(alnum)) return true;

  // 3) Letters-only substring scan (handles: "fuck454353", "sh1t", etc.)
  const lettersOnly = normalizeLettersOnly(raw);
  if (!lettersOnly) return false;

  for (const w of bannedSubstrings) {
    if (lettersOnly.includes(w)) return true;
  }

  return false;
}

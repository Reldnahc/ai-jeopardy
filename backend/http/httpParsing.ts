export { normalizeEmail, normalizeUsername } from "../repositories/profile/profile.util.js";

export function asRecord(v: unknown): Record<string, unknown> {
  return typeof v === "object" && v !== null ? (v as Record<string, unknown>) : {};
}

export function asTrimmedString(v: unknown): string {
  return String(v ?? "").trim();
}

export function clampFiniteNumber(
  raw: unknown,
  fallback: number,
  min: number,
  max: number,
): number {
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(Math.max(parsed, min), max);
}

import type { Request } from "express";
import { asRecord, asTrimmedString, clampFiniteNumber, normalizeUsername } from "./httpParsing.js";

export { asRecord, asTrimmedString, clampFiniteNumber, normalizeUsername };

export function parseSearchLimit(raw: unknown): number {
  return clampFiniteNumber(raw, 5, 1, 20);
}

export function parseBoardsLimit(raw: unknown): number {
  return clampFiniteNumber(raw, 10, 1, 50);
}

export function parseBoardsOffset(raw: unknown): number {
  return clampFiniteNumber(raw, 0, 0, Number.MAX_SAFE_INTEGER);
}

export function parseBatchUsernames(raw: unknown): string[] {
  const list = Array.isArray(raw) ? raw : typeof raw === "string" ? raw.split(",") : [];
  return list.map(normalizeUsername).filter(Boolean).slice(0, 50);
}

export function getAuthedUserId(req: Request): string | null {
  const userIdRaw = req.user?.sub ?? req.user?.id ?? req.user?.userId;
  if (!userIdRaw) return null;
  return String(userIdRaw);
}

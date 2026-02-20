// backend/services/ai/boardSchemas.ts
import type { Clue } from "../../../../shared/types/board.js";

export type ClueKeyInput = { value?: number; question: string };

export type AiClue = {
  value: number;
  question: string;
  answer: string;
  category?: string;
  visual?: unknown; // keep loose; visuals module can narrow later
};

export type AiFinalClue = {
  question: string;
  answer: string;
  category?: string;
  visual?: unknown;
};

export type AiCategoryJson = { category: string; values: AiClue[] };
export type AiFinalCategoryJson = { category: string; values: AiFinalClue[] };

export function toBoardCategory(json: AiCategoryJson) {
  const cat = json.category.trim();

  const values: Clue[] = json.values.map((c) => ({
    ...c,
    category: cat, // stamp category onto each clue
  })) as Clue[];

  return { category: cat, values };
}

export function toFinalCategory(json: AiFinalCategoryJson) {
  const cat = json.category.trim();

  const values: Clue[] = json.values.map((c) => ({
    ...c,
    category: cat,
    value: 0, // sentinel for Final Jeopardy
  })) as Clue[];

  return { category: cat, values };
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null;
}

export function isAiCategoryJson(v: unknown): v is AiCategoryJson {
  if (!isRecord(v)) return false;
  if (typeof v.category !== "string") return false;
  if (!Array.isArray(v.values)) return false;

  return v.values.every(
    (c) =>
      isRecord(c) &&
      typeof c.value === "number" &&
      typeof c.question === "string" &&
      typeof c.answer === "string",
  );
}

export function isAiFinalCategoryJson(v: unknown): v is AiFinalCategoryJson {
  if (!isRecord(v)) return false;
  if (typeof v.category !== "string") return false;
  if (!Array.isArray(v.values) || v.values.length !== 1) return false;

  const c = v.values[0];
  return isRecord(c) && typeof c.question === "string" && typeof c.answer === "string";
}

export function clueKeyFor(boardType: string, clue: ClueKeyInput) {
  const v = typeof clue.value === "number" ? clue.value : null;
  const q = clue.question.trim();
  if (!q) return null;
  return `${boardType}:${v ?? "?"}:${q}`;
}

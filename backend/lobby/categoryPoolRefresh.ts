import type { GameState } from "../types/runtime.js";
import { normalizeCategory, shuffle } from "../services/categories/categoryUtils.js";
import { getUniqueCategories } from "../services/categories/getUniqueCategories.js";
import { createEmptyLockedCategories } from "./lockedCategories.js";

export function buildRefreshedLobbyCategories({
  currentCategories,
  lockedCategories,
  pool,
}: {
  currentCategories: string[];
  lockedCategories: GameState["lockedCategories"] | undefined | null;
  pool: unknown[];
}): string[] {
  const lockedState = lockedCategories ?? createEmptyLockedCategories();
  const lockedFirst = lockedState.firstBoard ?? [];
  const lockedSecond = lockedState.secondBoard ?? [];
  const lockedFinal = lockedState.finalJeopardy ?? [];

  const isLockedAt = (idx: number): boolean => {
    if (idx >= 0 && idx <= 4) return Boolean(lockedFirst[idx]);
    if (idx >= 5 && idx <= 9) return Boolean(lockedSecond[idx - 5]);
    if (idx === 10) return Boolean(lockedFinal[0]);
    return false;
  };

  const poolSet = pool.map((c) => String(c ?? "").trim()).filter(Boolean);
  const shuffledPool = shuffle(poolSet);
  const lockedCategoryNames = currentCategories
    .map((c, idx) => (isLockedAt(idx) ? String(c ?? "").trim() : ""))
    .filter(Boolean);
  const lockedKeys = new Set(lockedCategoryNames.map(normalizeCategory));

  const poolWithoutLocked = shuffledPool.filter((c) => {
    const key = normalizeCategory(String(c ?? ""));
    return key && !lockedKeys.has(key);
  });

  const unlockedIndexes = Array.from({ length: 11 }, (_, idx) => idx).filter(
    (idx) => !isLockedAt(idx),
  );
  const needed = unlockedIndexes.length;
  const replacement = poolWithoutLocked.slice(0, needed);
  if (replacement.length < needed) {
    const exclude = [...lockedCategoryNames, ...replacement];
    replacement.push(...getUniqueCategories(needed - replacement.length, { exclude }));
  }

  const nextCategories = [...currentCategories];
  let replacementIdx = 0;
  for (const idx of unlockedIndexes) {
    nextCategories[idx] = replacement[replacementIdx] ?? nextCategories[idx] ?? "";
    replacementIdx += 1;
  }

  return nextCategories;
}

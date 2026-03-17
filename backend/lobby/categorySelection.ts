import { getUniqueCategories } from "../services/categories/getUniqueCategories.js";
import { normalizeCategory, shuffle } from "../services/categories/categoryUtils.js";
import type { LobbyBoardType } from "../../shared/types/lobby.js";
import { toGlobalLobbyCategoryIndex } from "./categorySlots.js";

type UniqueCategoryFactory = typeof getUniqueCategories;

export function chooseRandomLobbyCategory(args: {
  currentCategories: unknown[];
  categoryPool?: unknown[] | null;
  getUniqueCategoriesFn?: UniqueCategoryFactory;
}): string {
  const exclude = args.currentCategories
    .map((category) => String(category ?? "").trim())
    .filter((value) => value.length > 0);

  const normalizedExclude = new Set(exclude.map(normalizeCategory));
  const poolChoices = shuffle(Array.isArray(args.categoryPool) ? args.categoryPool : []).filter(
    (category) => {
      const normalized = normalizeCategory(String(category ?? ""));
      return normalized && !normalizedExclude.has(normalized);
    },
  );

  if (poolChoices.length > 0) {
    return String(poolChoices[0] ?? "").trim();
  }

  const getUniqueCategoriesFn = args.getUniqueCategoriesFn ?? getUniqueCategories;
  return getUniqueCategoriesFn(1, { exclude })[0] ?? "";
}

export function applyLobbyCategoryValue(args: {
  categories: unknown[];
  boardType: LobbyBoardType;
  index: number;
  value: unknown;
}) {
  const globalIndex = toGlobalLobbyCategoryIndex(args.boardType, args.index);
  const nextValue = String(args.value ?? "").replace(/^\s+/, "");
  const nextCategories = args.categories.slice();

  nextCategories[globalIndex] = nextValue;

  return {
    categories: nextCategories,
    globalIndex,
    value: nextValue,
  };
}

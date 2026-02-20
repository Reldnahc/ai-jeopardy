import { buildCategoryPool } from "./categoryPool";
import { shuffle, normalizeCategory } from "./categoryUtils";

type Options = {
  exclude?: string[];
};

export function getUniqueCategories(count: number, options: Options = {}): string[] {
  const { exclude = [] } = options;

  const normalizedExclude = new Set(exclude.map(normalizeCategory));

  const pool = buildCategoryPool(300);

  const seen = new Set<string>();
  const result: string[] = [];

  for (const category of shuffle(pool)) {
    const key = normalizeCategory(category);

    if (seen.has(key)) continue;
    if (normalizedExclude.has(key)) continue;

    seen.add(key);
    result.push(category);

    if (result.length === count) break;
  }

  if (result.length < count) {
    throw new Error(`Unable to generate ${count} unique categories. Pool too small.`);
  }

  return result;
}

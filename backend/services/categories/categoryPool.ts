import { generateTemplateCategory } from "./categoryGenerator.js";

export function buildCategoryPool(size = 2000): string[] {
  const generated = Array.from({ length: size }, generateTemplateCategory);
  return [...generated];
}

export type { CategoryPromptSettings, ReasoningEffort } from "./boardPromptTemplates.js";

import {
  buildCategoryPromptFromWorkflow,
  buildFinalPromptFromWorkflow,
  type CategoryPromptSettings,
} from "./boardPromptTemplates.js";

export function categoryPrompt(
  category: string,
  double: boolean,
  settings: CategoryPromptSettings,
) {
  return buildCategoryPromptFromWorkflow(
    category,
    double,
    {
      reasoning_effort: settings.reasoningEffort,
      prompt_preset: "baseline",
      prompt_settings: {
        include_visuals: settings.includeVisuals,
        max_visual_clues_per_category: settings.maxVisualCluesPerCategory,
        reasoning_effort: settings.reasoningEffort,
        max_image_search_tries: settings.maxImageSearchTries,
        commons_thumb_width: settings.commonsThumbWidth,
        prefer_photos: settings.preferPhotos,
        include_examples: settings.includeExamples,
        include_fill_template: settings.includeFillTemplate,
      },
    },
    process.cwd(),
  );
}

export function finalPrompt(category: string) {
  return buildFinalPromptFromWorkflow(category, { prompt_preset: "baseline" }, process.cwd());
}

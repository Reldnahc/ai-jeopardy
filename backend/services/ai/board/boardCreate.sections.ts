import type { Ctx } from "../../../ws/context.types.js";
import { categoryPrompt, finalPrompt } from "./boardPrompts.js";
import type { CallAiJson, ParseAiJson } from "./boardGenerate.js";
import { generateAiCategoryJson, generateAiFinalCategoryJson } from "./boardGenerate.js";
import { toBoardCategory, toFinalCategory } from "./boardSchemas.js";
import type { BoardTtsState } from "./boardTts.js";
import { enqueueCategoryTts, enqueueFinalTts } from "./boardTts.js";
import { makeProgressReporter } from "./boardTelemetry.js";
import {
  toBoardVisualSettings,
  trackNewTtsPromises,
  type ResolvedCreateBoardSettings,
} from "./boardCreate.helpers.js";

type LimiterFn = <T>(fn: () => Promise<T>) => Promise<T>;
type ProgressReporter = ReturnType<typeof makeProgressReporter>;
type BoardTrace = ResolvedCreateBoardSettings["trace"];

type BuildCategorySectionArgs = {
  ctx: Ctx;
  boardType: "firstBoard" | "secondBoard";
  categoryName: string;
  index: number;
  isDoubleJeopardy: boolean;
  model: string;
  settings: ResolvedCreateBoardSettings;
  callAiJson: CallAiJson;
  parseAiJson: ParseAiJson;
  limitVisuals: LimiterFn | null;
  limitTts: LimiterFn | null;
  ttsState: BoardTtsState;
  progress: ProgressReporter;
};

type BuildFinalSectionArgs = {
  ctx: Ctx;
  categoryName: string;
  model: string;
  settings: ResolvedCreateBoardSettings;
  callAiJson: CallAiJson;
  parseAiJson: ParseAiJson;
  limitVisuals: LimiterFn | null;
  limitTts: LimiterFn | null;
  ttsState: BoardTtsState;
  progress: ProgressReporter;
};

async function maybePopulateVisuals(args: {
  ctx: Ctx;
  category: { category: string; values: unknown[] };
  settings: ResolvedCreateBoardSettings;
  limitVisuals: LimiterFn | null;
  progress: ProgressReporter;
}) {
  if (!args.settings.includeVisuals || !args.limitVisuals) return;

  await args.limitVisuals(() =>
    args.ctx.populateCategoryVisuals(
      args.ctx,
      args.category,
      toBoardVisualSettings(args.settings),
      args.progress.tick,
    ),
  );
}

function trackCategoryBuild(trace: BoardTrace, eventBase: "single" | "double", index: number, cat: string) {
  trace?.mark(`${eventBase}_category_begin`, { i: index, cat });
  return () => {
    trace?.mark(`${eventBase}_category_end`, { i: index, cat });
  };
}

export async function buildBoardCategorySection(
  args: BuildCategorySectionArgs,
) {
  const finishTrace = trackCategoryBuild(
    args.settings.trace,
    args.isDoubleJeopardy ? "double" : "single",
    args.index,
    args.categoryName,
  );

  const prompt = categoryPrompt(args.categoryName, args.isDoubleJeopardy, {
    includeVisuals: args.settings.includeVisuals,
    maxVisualCluesPerCategory: args.settings.maxVisualCluesPerCategory,
    reasoningEffort: args.settings.reasoningEffort,
    maxImageSearchTries: args.settings.maxImageSearchTries,
    commonsThumbWidth: args.settings.commonsThumbWidth,
    preferPhotos: args.settings.preferPhotos,
    includeExamples: true,
    includeFillTemplate: true,
  });

  const ai = await generateAiCategoryJson({
    callAiJson: args.callAiJson,
    parseAiJson: args.parseAiJson,
    model: args.model,
    prompt,
    reasoningEffort: args.settings.reasoningEffort,
    errorLabel: `${args.isDoubleJeopardy ? "Double" : "Single"} category ${args.index}`,
  });

  const category = toBoardCategory(ai);
  args.progress.tick(1);

  const ttsBefore = args.ttsState.ttsPromises.length;
  const queuedTts = enqueueCategoryTts({
    ctx: args.ctx,
    boardType: args.boardType,
    json: ai,
    narrationEnabled: args.settings.narrationEnabled,
    limitTts: args.limitTts,
    ttsVoiceId: args.settings.ttsVoiceId,
    onTtsReady: args.settings.onTtsReady,
    state: args.ttsState,
  });

  if (queuedTts > 0) {
    trackNewTtsPromises(args.ttsState, args.progress, ttsBefore);
  }

  await maybePopulateVisuals({
    ctx: args.ctx,
    category,
    settings: args.settings,
    limitVisuals: args.limitVisuals,
    progress: args.progress,
  });

  finishTrace();
  return category;
}

export async function buildFinalBoardSection(
  args: BuildFinalSectionArgs,
) {
  args.settings.trace?.mark("final_category_begin", { cat: args.categoryName });

  const ai = await generateAiFinalCategoryJson({
    callAiJson: args.callAiJson,
    parseAiJson: args.parseAiJson,
    model: args.model,
    prompt: finalPrompt(args.categoryName),
    reasoningEffort: args.settings.reasoningEffort,
    errorLabel: "Final jeopardy",
  });

  const category = toFinalCategory(ai);
  args.progress.tick(1);

  const ttsBefore = args.ttsState.ttsPromises.length;
  const queuedTts = enqueueFinalTts({
    ctx: args.ctx,
    json: ai,
    narrationEnabled: args.settings.narrationEnabled,
    limitTts: args.limitTts,
    ttsVoiceId: args.settings.ttsVoiceId,
    onTtsReady: args.settings.onTtsReady,
    state: args.ttsState,
  });

  if (queuedTts > 0) {
    trackNewTtsPromises(args.ttsState, args.progress, ttsBefore);
  }

  await maybePopulateVisuals({
    ctx: args.ctx,
    category,
    settings: args.settings,
    limitVisuals: args.limitVisuals,
    progress: args.progress,
  });

  args.settings.trace?.mark("final_category_end", { cat: args.categoryName });
  return category;
}

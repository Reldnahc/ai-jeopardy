import type { BoardData } from "../../../../shared/types/board.js";
import type { Ctx } from "../../../ws/context.types.js";
import type { Board } from "../../../http/boardRoutes.js";
import { makeProgressReporter } from "./boardTelemetry.js";
import { createBoardTtsState } from "./boardTts.js";
import {
  buildDailyDoubleClueKeys,
  resolveCreateBoardSettings,
  saveBoardAsync,
  type CreateBoardOptions,
} from "./boardCreate.helpers.js";
import { buildBoardCategorySection, buildFinalBoardSection } from "./boardCreate.sections.js";

export async function createBoardData(
  ctx: Ctx,
  categories: string[],
  model: string,
  host: string,
  options: CreateBoardOptions = {},
): Promise<BoardData> {
  const settings = resolveCreateBoardSettings(options);
  const trace = settings.trace;

  trace?.mark("aiService_enter", { model, includeVisuals: settings.includeVisuals });

  if (!categories || categories.length !== 11) {
    throw new Error("You must provide exactly 11 categories.");
  }

  const modelDef = ctx.modelsByValue[model];
  if (!modelDef) {
    throw new Error(`Unknown model: ${model}`);
  }

  const [firstCategories, secondCategories, finalCategory] = [
    categories.slice(0, 5),
    categories.slice(5, 10),
    categories[10],
  ];

  const baseTotal = 11 + (settings.includeVisuals ? ctx.plannedVisualSlots(settings) + 1 : 0);
  const plannedTts = settings.narrationEnabled ? 2 * (10 * 5 + 1) : 0;

  const progress = makeProgressReporter(settings.onProgress);
  progress.setTotal(baseTotal + plannedTts);
  progress.report();

  const limitVisuals = settings.includeVisuals ? ctx.makeLimiter(3) : null;
  const limitTts = settings.narrationEnabled ? ctx.makeLimiter(10) : null;
  const ttsState = createBoardTtsState();

  const { callAiJson, parseAiJson } = await import("../aiClients/index.js");
  trace?.mark("createBoardData_begin");

  try {
    const firstCategoryPromises = firstCategories.map((categoryName, index) =>
      buildBoardCategorySection({
        ctx,
        boardType: "firstBoard",
        categoryName,
        index,
        isDoubleJeopardy: false,
        model,
        settings,
        callAiJson,
        parseAiJson,
        limitVisuals,
        limitTts,
        ttsState,
        progress,
      }),
    );

    const secondCategoryPromises = secondCategories.map((categoryName, index) =>
      buildBoardCategorySection({
        ctx,
        boardType: "secondBoard",
        categoryName,
        index,
        isDoubleJeopardy: true,
        model,
        settings,
        callAiJson,
        parseAiJson,
        limitVisuals,
        limitTts,
        ttsState,
        progress,
      }),
    );

    const finalPromise = buildFinalBoardSection({
      ctx,
      categoryName: finalCategory,
      model,
      settings,
      callAiJson,
      parseAiJson,
      limitVisuals,
      limitTts,
      ttsState,
      progress,
    });

    trace?.mark("await_all_results_begin");
    const [firstCategoryResults, secondCategoryResults, finalBuilt] = await Promise.all([
      Promise.all(firstCategoryPromises),
      Promise.all(secondCategoryPromises),
      finalPromise,
    ]);
    trace?.mark("await_all_results_end");

    if (settings.narrationEnabled && ttsState.ttsPromises.length > 0) {
      trace?.mark("await_all_tts_begin", { count: ttsState.ttsPromises.length });
      await Promise.all(ttsState.ttsPromises);
      trace?.mark("await_all_tts_end", { count: ttsState.ttsPromises.length });
    }

    const firstBoard = { categories: firstCategoryResults };
    const secondBoard = { categories: secondCategoryResults };
    const finalJeopardy = { categories: [finalBuilt] };

    const boardRow: Board = { host, model, firstBoard, secondBoard, finalJeopardy };

    if (settings.includeVisuals) {
      progress.tick(1);
    }

    void saveBoardAsync(ctx, host, boardRow);

    progress.finish();

    trace?.mark("createBoardData_success", {
      ttsJobs: ttsState.ttsPromises.length,
      visuals: settings.includeVisuals,
    });

    return {
      firstBoard,
      secondBoard,
      finalJeopardy,
      ttsAssetIds: Array.from(ttsState.ttsIds),
      ttsByClueKey: ttsState.ttsByClueKey,
      ttsByAnswerKey: ttsState.ttsByAnswerKey,
      dailyDoubleClueKeys: buildDailyDoubleClueKeys({ firstBoard, secondBoard }),
    };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    trace?.mark("createBoardData_fail", { msg: message });
    console.error("[Server] Error generating board data:", message);
    throw error;
  }
}

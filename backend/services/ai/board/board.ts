// backend/services/ai/board.ts
import type { BoardData } from "../../../../shared/types/board.js";
import type { VisualSettings } from "../visuals.js";
import type { Ctx } from "../../../ws/context.types.js";
import { Board } from "../../../http/boardRoutes.js";

import { categoryPrompt, finalPrompt } from "./boardPrompts.js";
import { makeProgressReporter } from "./boardTelemetry.js";
import { toBoardCategory, toFinalCategory } from "./boardSchemas.js";
import { createBoardTtsState, enqueueCategoryTts, enqueueFinalTts } from "./boardTts.js";
import { generateAiCategoryJson, generateAiFinalCategoryJson } from "./boardGenerate.js";

type CreateBoardOptions = Partial<VisualSettings> & {
    reasoningEffort?: "off" | "low" | "medium" | "high";
    narrationEnabled?: boolean;
    onProgress?: (p: { done: number; total: number; progress: number }) => void;
    onTtsReady?: (assetId: string) => void;
    trace?: { mark: (event: string, meta?: Record<string, unknown>) => void };
};

function buildClueKey(boardKey: "firstBoard" | "secondBoard", value: unknown, question: unknown) {
    const v = String(value ?? "");
    const q = String(question ?? "").trim();
    return `${boardKey}:${v}:${q}`;
}

function pickRandomDistinct<T>(arr: T[], n: number): T[] {
    const copy = arr.slice();
    for (let i = copy.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [copy[i], copy[j]] = [copy[j], copy[i]];
    }
    return copy.slice(0, Math.max(0, Math.min(n, copy.length)));
}

function collectClueKeys(
    boardKey: "firstBoard" | "secondBoard",
    board: { categories: Array<{ values: Array<{ value: unknown; question: unknown }> }> }
) {
    const out: string[] = [];
    for (const cat of board?.categories ?? []) {
        for (const clue of cat?.values ?? []) {
            out.push(buildClueKey(boardKey, clue?.value, clue?.question));
        }
    }
    return out;
}

async function saveBoardAsync(ctx: Ctx, host: string, board: Board) {
    try {
        const normalizedHost = String(host ?? "").toLowerCase().trim();
        const ownerId = await ctx.repos.profiles.getIdByUsername(normalizedHost);
        if (!ownerId) return;

        await ctx.repos.boards.insertBoard(ownerId, board);
        await ctx.repos.profiles.incrementBoardsGenerated(ownerId);
    } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        console.error("[Board] saveBoardAsync failed:", msg);
    }
}

/**
 * Wraps any newly appended promises in ttsState.ttsPromises so each promise
 * increments progress once it settles (success or fail).
 */
function trackNewTtsPromises(
    ttsState: { ttsPromises: Promise<unknown>[] },
    progress: ReturnType<typeof makeProgressReporter>,
    beforeLen: number
) {
    for (let i = beforeLen; i < ttsState.ttsPromises.length; i++) {
        const p = ttsState.ttsPromises[i];
        ttsState.ttsPromises[i] = Promise.resolve(p).finally(() => {
            progress.tick(1);
        });
    }
}

export async function createBoardData(
    ctx: Ctx,
    categories: string[],
    model: string,
    host: string,
    options: CreateBoardOptions = {}
): Promise<BoardData> {
    const settings = {
        includeVisuals: false,
        imageProvider: "commons",
        maxVisualCluesPerCategory: 2,
        maxImageSearchTries: 6,
        commonsThumbWidth: 1600,
        preferPhotos: true,

        reasoningEffort: "off",
        narrationEnabled: false,

        onProgress: undefined,
        onTtsReady: undefined,
        trace: undefined,

        ...options,
    } satisfies Required<Omit<CreateBoardOptions, "onProgress" | "onTtsReady" | "trace">> &
        Pick<CreateBoardOptions, "onProgress" | "onTtsReady" | "trace">;

    const trace = settings.trace;
    trace?.mark("aiService_enter", { model, includeVisuals: settings.includeVisuals });

    if (!categories || categories.length !== 11) {
        throw new Error("You must provide exactly 11 categories.");
    }

    const [firstCategories, secondCategories, finalCategory] = [
        categories.slice(0, 5),
        categories.slice(5, 10),
        categories[10],
    ];

    const modelDef = ctx.modelsByValue[model];
    if (!modelDef) throw new Error(`Unknown model: ${model}`);

    const baseTotal = 11 + (settings.includeVisuals ? ctx.plannedVisualSlots(settings) + 1 : 0);

    const plannedTts = settings.narrationEnabled ? (2 * ((10 * 5) + 1)) : 0;

    const progress = makeProgressReporter(settings.onProgress);
    progress.setTotal(baseTotal + plannedTts);
    progress.report();

    // Concurrency controls
    const limitVisuals = settings.includeVisuals ? ctx.makeLimiter(3) : null;
    const limitTts = settings.narrationEnabled ? ctx.makeLimiter(10) : null;

    // TTS state
    const ttsState = createBoardTtsState();

    // OpenAI client (dynamic import kept)
    const { callOpenAiJson, parseOpenAiJson } = await import("../openaiClient.js");
    trace?.mark("createBoardData_begin");

    try {
        // ---- SINGLE JEOPARDY categories ----
        const firstCategoryPromises = firstCategories.map(async (cat, i) => {
            trace?.mark("single_category_begin", { i, cat });

            const prompt = categoryPrompt(cat, false, {
                includeVisuals: settings.includeVisuals,
                maxVisualCluesPerCategory: settings.maxVisualCluesPerCategory,
                reasoningEffort: settings.reasoningEffort,
                maxImageSearchTries: settings.maxImageSearchTries,
                commonsThumbWidth: settings.commonsThumbWidth,
                preferPhotos: settings.preferPhotos,
                includeExamples: true,
                includeFillTemplate: true,
            });

            const ai = await generateAiCategoryJson({
                callOpenAiJson,
                parseOpenAiJson,
                model,
                prompt,
                reasoningEffort: settings.reasoningEffort,
                errorLabel: `Single category ${i}`,
            });

            const category = toBoardCategory(ai);

            // count the AI category as done
            progress.tick(1);

            // enqueue TTS and hook progress to the newly-added promises
            const beforeTts = ttsState.ttsPromises.length;
            const queued = enqueueCategoryTts({
                ctx,
                boardType: "firstBoard",
                json: ai,
                narrationEnabled: settings.narrationEnabled,
                limitTts,
                onTtsReady: settings.onTtsReady,
                state: ttsState,
            });

            if (queued > 0) {
                trackNewTtsPromises(ttsState, progress, beforeTts);
            }

            // visuals (each visual slot should tick via progress.tick passed into populateCategoryVisuals)
            if (settings.includeVisuals && limitVisuals) {
                const visualSettings: VisualSettings = {
                    includeVisuals: settings.includeVisuals,
                    imageProvider: settings.imageProvider,
                    maxVisualCluesPerCategory: settings.maxVisualCluesPerCategory,
                    maxImageSearchTries: settings.maxImageSearchTries,
                    commonsThumbWidth: settings.commonsThumbWidth,
                    preferPhotos: settings.preferPhotos,
                };

                await limitVisuals(() =>
                    ctx.populateCategoryVisuals(ctx, category, visualSettings, progress.tick)
                );
            }

            trace?.mark("single_category_end", { i, cat });
            return category;
        });

        // ---- DOUBLE JEOPARDY categories ----
        const secondCategoryPromises = secondCategories.map(async (cat, i) => {
            trace?.mark("double_category_begin", { i, cat });

            const prompt = categoryPrompt(cat, true, {
                includeVisuals: settings.includeVisuals,
                maxVisualCluesPerCategory: settings.maxVisualCluesPerCategory,
                reasoningEffort: settings.reasoningEffort,
                maxImageSearchTries: settings.maxImageSearchTries,
                commonsThumbWidth: settings.commonsThumbWidth,
                preferPhotos: settings.preferPhotos,
                includeExamples: true,
                includeFillTemplate: true,
            });

            const ai = await generateAiCategoryJson({
                callOpenAiJson,
                parseOpenAiJson,
                model,
                prompt,
                reasoningEffort: settings.reasoningEffort,
                errorLabel: `Double category ${i}`,
            });

            const category = toBoardCategory(ai);

            // count the AI category as done
            progress.tick(1);

            // enqueue TTS and hook progress to the newly-added promises
            const beforeTts = ttsState.ttsPromises.length;
            const queued = enqueueCategoryTts({
                ctx,
                boardType: "secondBoard",
                json: ai,
                narrationEnabled: settings.narrationEnabled,
                limitTts,
                onTtsReady: settings.onTtsReady,
                state: ttsState,
            });

            if (queued > 0) {
                trackNewTtsPromises(ttsState, progress, beforeTts);
            }

            if (settings.includeVisuals && limitVisuals) {
                const visualSettings: VisualSettings = {
                    includeVisuals: settings.includeVisuals,
                    imageProvider: settings.imageProvider,
                    maxVisualCluesPerCategory: settings.maxVisualCluesPerCategory,
                    maxImageSearchTries: settings.maxImageSearchTries,
                    commonsThumbWidth: settings.commonsThumbWidth,
                    preferPhotos: settings.preferPhotos,
                };

                await limitVisuals(() =>
                    ctx.populateCategoryVisuals(ctx, category, visualSettings, progress.tick)
                );
            }

            trace?.mark("double_category_end", { i, cat });
            return category;
        });

        // ---- FINAL JEOPARDY ----
        const finalPromise = (async () => {
            trace?.mark("final_category_begin", { cat: finalCategory });

            const prompt = finalPrompt(finalCategory);

            const ai = await generateAiFinalCategoryJson({
                callOpenAiJson,
                parseOpenAiJson,
                model,
                prompt,
                reasoningEffort: settings.reasoningEffort,
                errorLabel: "Final jeopardy",
            });

            const category = toFinalCategory(ai);

            // count the AI final category as done
            progress.tick(1);

            // enqueue TTS and hook progress to newly-added promises
            const beforeTts = ttsState.ttsPromises.length;
            const queued = enqueueFinalTts({
                ctx,
                json: ai,
                narrationEnabled: settings.narrationEnabled,
                limitTts,
                onTtsReady: settings.onTtsReady,
                state: ttsState,
            });

            if (queued > 0) {
                trackNewTtsPromises(ttsState, progress, beforeTts);
            }

            if (settings.includeVisuals && limitVisuals) {
                const visualSettings: VisualSettings = {
                    includeVisuals: settings.includeVisuals,
                    imageProvider: settings.imageProvider,
                    maxVisualCluesPerCategory: settings.maxVisualCluesPerCategory,
                    maxImageSearchTries: settings.maxImageSearchTries,
                    commonsThumbWidth: settings.commonsThumbWidth,
                    preferPhotos: settings.preferPhotos,
                };

                await limitVisuals(() =>
                    ctx.populateCategoryVisuals(ctx, category, visualSettings, progress.tick)
                );
            }

            trace?.mark("final_category_end", { cat: finalCategory });
            return category;
        })();

        trace?.mark("await_all_results_begin");
        const [firstCategoryResults, secondCategoryResults, finalBuilt] = await Promise.all([
            Promise.all(firstCategoryPromises),
            Promise.all(secondCategoryPromises),
            finalPromise,
        ]);
        trace?.mark("await_all_results_end");

        // Wait for all TTS (wrapped promises tick progress as they settle)
        if (settings.narrationEnabled && ttsState.ttsPromises.length > 0) {
            trace?.mark("await_all_tts_begin", { count: ttsState.ttsPromises.length });
            await Promise.all(ttsState.ttsPromises);
            trace?.mark("await_all_tts_end", { count: ttsState.ttsPromises.length });
        }

        const firstBoard = { categories: firstCategoryResults };
        const secondBoard = { categories: secondCategoryResults };
        const finalJeopardy = { categories: [finalBuilt] };

        const boardRow: Board = { host, model, firstBoard, secondBoard, finalJeopardy };

        if (settings.includeVisuals) progress.tick(1);

        void saveBoardAsync(ctx, host, boardRow);

        const firstKeys = collectClueKeys("firstBoard", firstBoard);
        const secondKeys = collectClueKeys("secondBoard", secondBoard);

        const dailyDoubleClueKeys = {
            firstBoard: pickRandomDistinct(firstKeys, 1),
            secondBoard: pickRandomDistinct(secondKeys, 2),
        };

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
            dailyDoubleClueKeys,
        };
    } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        trace?.mark("createBoardData_fail", { msg });
        console.error("[Server] Error generating board data:", msg);
        throw e;
    }
}

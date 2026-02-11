// backend/services/ai/board.ts
import type { BoardData } from "../../../../shared/types/board.js";
import type { VisualSettings } from "../visuals.js";
import type { Ctx } from "../../../ws/context.types.js";
import { Board } from "../../../http/boardRoutes.js";

import { categoryPrompt, finalPrompt } from "./boardPrompts.js";
import { timed, makeProgressReporter } from "./boardTelemetry.js";
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

    // Progress
    const total =
        11 + (settings.includeVisuals ? ctx.plannedVisualSlots(settings) + 1 : 0);
    const progress = makeProgressReporter(settings.onProgress);
    progress.setTotal(total);
    progress.report();

    // Concurrency controls
    const limitVisuals = settings.includeVisuals ? ctx.makeLimiter(2) : null;
    const limitTts = settings.narrationEnabled ? ctx.makeLimiter(3) : null;

    // TTS state
    const ttsState = createBoardTtsState();

    // OpenAI client (dynamic import kept)
    const { callOpenAiJson, parseOpenAiJson } = await import("../openaiClient.js");
    trace?.mark("createBoardData BEGIN");

    try {
        // ---- SINGLE JEOPARDY categories ----
        const firstCategoryPromises = firstCategories.map((cat, i) =>
            timed(trace, `SINGLE C${i + 1} (${cat})`, async () => {
                const prompt = categoryPrompt(cat, false, {
                    includeVisuals: settings.includeVisuals,
                    maxVisualCluesPerCategory: settings.maxVisualCluesPerCategory,
                    reasoningEffort: settings.reasoningEffort,
                    maxImageSearchTries: settings.maxImageSearchTries,
                    commonsThumbWidth: settings.commonsThumbWidth,
                    preferPhotos: settings.preferPhotos,
                    includeExamples: true,
                    includeFillTemplate: true
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
                return { ai, category };
            }).then(async ({ ai, category }) => {
                progress.tick(1);

                enqueueCategoryTts({
                    ctx,
                    boardType: "firstBoard",
                    json: ai,
                    narrationEnabled: settings.narrationEnabled,
                    limitTts,
                    onTtsReady: settings.onTtsReady,
                    state: ttsState,
                });

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

                return category;
            })
        );

        // ---- DOUBLE JEOPARDY categories ----
        const secondCategoryPromises = secondCategories.map((cat, i) =>
            timed(trace, `DOUBLE C${i + 1} (${cat})`, async () => {
                const prompt = categoryPrompt(cat, true, {
                    includeVisuals: settings.includeVisuals,
                    maxVisualCluesPerCategory: settings.maxVisualCluesPerCategory,
                    reasoningEffort: settings.reasoningEffort,
                    maxImageSearchTries: settings.maxImageSearchTries,
                    commonsThumbWidth: settings.commonsThumbWidth,
                    preferPhotos: settings.preferPhotos,
                    includeExamples: true,
                    includeFillTemplate: true
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
                return { ai, category };
            }).then(async ({ ai, category }) => {
                progress.tick(1);

                enqueueCategoryTts({
                    ctx,
                    boardType: "secondBoard",
                    json: ai,
                    narrationEnabled: settings.narrationEnabled,
                    limitTts,
                    onTtsReady: settings.onTtsReady,
                    state: ttsState,
                });

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

                return category;
            })
        );

        // ---- FINAL JEOPARDY ----
        const finalPromise = timed(trace, `FINAL (${finalCategory})`, async () => {
            const prompt = finalPrompt(finalCategory);

            const ai = await generateAiFinalCategoryJson({
                callOpenAiJson,
                parseOpenAiJson,
                model,
                prompt,
                reasoningEffort: settings.reasoningEffort,
                errorLabel: "Final jeopardy"
            });

            const category = toFinalCategory(ai);
            return { ai, category };
        }).then(async ({ ai, category }) => {
            progress.tick(1);

            enqueueFinalTts({
                ctx,
                json: ai,
                narrationEnabled: settings.narrationEnabled,
                limitTts,
                onTtsReady: settings.onTtsReady,
                state: ttsState,
            });

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

            return category;
        });

        // ---- Await generation ----
        const [firstCategoryResults, secondCategoryResults, finalBuilt] = await timed(
            trace,
            "AWAIT ALL RESULTS",
            async () =>
                Promise.all([
                    Promise.all(firstCategoryPromises),
                    Promise.all(secondCategoryPromises),
                    finalPromise,
                ])
        );

        // ---- Await TTS ----
        if (settings.narrationEnabled && ttsState.ttsPromises.length > 0) {
            await timed(trace, "AWAIT ALL TTS", async () => Promise.all(ttsState.ttsPromises));
        }

        const firstBoard = { categories: firstCategoryResults };
        const secondBoard = { categories: secondCategoryResults };
        const finalJeopardy = { categories: [finalBuilt] };

        const boardRow: Board = { host, model, firstBoard, secondBoard, finalJeopardy };

        if (settings.includeVisuals) progress.tick(1);

        void saveBoardAsync(ctx, host, boardRow);

        return {
            firstBoard,
            secondBoard,
            finalJeopardy,
            ttsAssetIds: Array.from(ttsState.ttsIds),
            ttsByClueKey: ttsState.ttsByClueKey,
            ttsByAnswerKey: ttsState.ttsByAnswerKey,
        };
    } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        console.error("[Server] Error generating board data:", msg);
        throw e;
    }
}

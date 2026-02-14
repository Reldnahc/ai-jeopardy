// backend/services/ai/boardTts.ts
import type { Ctx } from "../../../ws/context.types.js";
import type { AiCategoryJson, AiFinalCategoryJson } from "./boardSchemas.js";
import { clueKeyFor } from "./boardSchemas.js";

type LimiterFn = <T>(fn: () => Promise<T>) => Promise<T>;

export type BoardTtsState = {
    ttsPromises: Array<Promise<unknown>>;
    ttsIds: Set<string>;
    ttsByClueKey: Record<string, string>;
    ttsByAnswerKey: Record<string, string>;
};

export function createBoardTtsState(): BoardTtsState {
    return {
        ttsPromises: [],
        ttsIds: new Set<string>(),
        ttsByClueKey: Object.create(null) as Record<string, string>,
        ttsByAnswerKey: Object.create(null) as Record<string, string>,
    };
}

type EnqueueCommon = {
    ctx: Ctx;
    narrationEnabled: boolean;
    limitTts: LimiterFn | null;
    onTtsReady?: (assetId: string) => void;
    state: BoardTtsState;
};

function enqueueOneTts(
    args: EnqueueCommon & { key: string; text: string; into: "clue" | "answer" }
): boolean {
    const { ctx, narrationEnabled, limitTts, onTtsReady, state, key, text, into } = args;
    if (!narrationEnabled || !limitTts) return false;

    const trimmed = text.trim();
    if (!trimmed) return false;

    const ttsProvider = "kokoro:af_heart";

    const p = limitTts(async () => {
        const asset = await ctx.ensureTtsAsset(
            { text: trimmed, voiceId: ttsProvider ?? "kokoro:af_heart" },
            ctx.repos
        );

        state.ttsIds.add(asset.id);

        if (into === "clue") state.ttsByClueKey[key] = asset.id;
        else state.ttsByAnswerKey[key] = asset.id;

        onTtsReady?.(asset.id);
    }).catch((e: unknown) => {
        if (into === "clue") console.error("[TTS] clue failed:", e);
        else console.error("[TTS] answer failed:", e);
    });

    state.ttsPromises.push(p);
    return true;
}

export function enqueueCategoryTts(
    args: EnqueueCommon & { boardType: "firstBoard" | "secondBoard"; json: AiCategoryJson }
): number {
    const { boardType, json } = args;

    let queued = 0;
    for (const clue of json.values) {
        const key = clueKeyFor(boardType, clue);
        if (!key) continue;

        if (enqueueOneTts({ ...args, key, text: clue.question, into: "clue" })) queued++;
        if (enqueueOneTts({ ...args, key, text: clue.answer, into: "answer" })) queued++;
    }
    return queued;
}

export function enqueueFinalTts(
    args: EnqueueCommon & { json: AiFinalCategoryJson }
): number {
    const { json } = args;

    let queued = 0;
    for (const clue of json.values) {
        const key = clueKeyFor("finalJeopardy", { question: clue.question });
        if (!key) continue;

        if (enqueueOneTts({ ...args, key, text: clue.question, into: "clue" })) queued++;
        if (enqueueOneTts({ ...args, key, text: clue.answer, into: "answer" })) queued++;
    }
    return queued;
}


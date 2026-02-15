// backend/services/ai/boardTts.ts
import type {Ctx, Game} from "../../../ws/context.types.js";
import type {AiCategoryJson, AiFinalCategoryJson} from "./boardSchemas.js";
import {clueKeyFor} from "./boardSchemas.js";
import {BoardData} from "../../../../shared/types/board.js";

type LimiterFn = <T>(fn: () => Promise<T>) => Promise<T>;

type EnqueueCommon = {
    ctx: Ctx;
    narrationEnabled: boolean;
    limitTts: LimiterFn | null;
    onTtsReady?: (assetId: string) => void;
    state: BoardTtsState;
};

export type BoardTtsState = {
    ttsPromises: Array<Promise<unknown>>;
    ttsIds: Set<string>;
    ttsByClueKey: Record<string, string>;
    ttsByAnswerKey: Record<string, string>;
};

function buildClueKey(boardKey: "firstBoard" | "secondBoard", value: unknown, question: unknown) {
    const v = String(value ?? "");
    const q = String(question ?? "").trim();
    return `${boardKey}:${v}:${q}`;
}

function narrationTextForClue( question: unknown) {
    const q = String(question ?? "").trim();
    if (!q) return "";
    return `${q}`.trim();
}

export async function ensureBoardNarrationTtsForBoardData(args: {
    ctx: Ctx;
    game: Game;
    boardData: BoardData;
    narrationEnabled: boolean;
    onTtsReady?: (assetId: string) => void;
    trace?: { mark: (event: string, meta?: Record<string, unknown>) => void };
}) {
    const { ctx, boardData, narrationEnabled, onTtsReady, trace, game } = args;

    // Always ensure these fields exist so preload code can rely on them.
    boardData.ttsAssetIds = Array.isArray(boardData.ttsAssetIds) ? boardData.ttsAssetIds : [];
    boardData.ttsByClueKey = boardData.ttsByClueKey ?? {};
    boardData.ttsByAnswerKey = boardData.ttsByAnswerKey ?? {};

    if (!narrationEnabled) {
        trace?.mark?.("imported_tts_skip_narration_disabled");
        return boardData;
    }

    // Concurrency similar to generation path
    const limitTts = ctx.makeLimiter(10);

    const ttsState = createBoardTtsState();
    const jobs: Promise<void>[] = [];

    const pushId = (id: string | null | undefined) => {
        const v = String(id ?? "").trim();
        if (!v) return;
        ttsState.ttsIds.add(v);
        onTtsReady?.(v);
    };

    const enqueueClueText = (text: string, clueKey: string, voice: string | null) => {
        const trimmed = String(text ?? "").trim();
        if (!trimmed) return;

        const existing = boardData.ttsByClueKey?.[clueKey];
        if (existing) {
            pushId(existing);
            return;
        }

        jobs.push(
            limitTts(async () => {
                const asset = await ctx.ensureTtsAsset(
                    {
                        text: trimmed,
                        voiceId: voice ?? "kokoro:af_heart",
                    },
                    ctx.repos
                );

                boardData.ttsByClueKey[clueKey] = asset.id;
                pushId(asset.id);
            })
        );
    };

    const enqueueAnswerText = (text: string, answerKey: string, voice: string | null) => {
        const trimmed = String(text ?? "").trim();
        if (!trimmed) return;

        const existing = boardData.ttsByAnswerKey?.[answerKey];
        if (existing) {
            pushId(existing);
            return;
        }

        jobs.push(
            limitTts(async () => {
                const asset = await ctx.ensureTtsAsset(
                    {
                        text: trimmed,
                        voiceId: voice ?? "kokoro:af_heart",
                    },
                    ctx.repos
                );

                boardData.ttsByAnswerKey[answerKey] = asset.id;
                pushId(asset.id);
            })
        );
    };

    // First board + second board
    for (const [boardKey, cats] of [
        ["firstBoard", boardData.firstBoard?.categories ?? []],
        ["secondBoard", boardData.secondBoard?.categories ?? []],
    ] as const) {
        for (const cat of cats) {
            for (const clue of cat?.values ?? []) {
                const key = buildClueKey(boardKey, clue?.value, clue?.question);

                // Question narration
                enqueueClueText(narrationTextForClue(clue?.question), key, game.ttsProvider);

                // Answer narration (FIX)
                // Use the same key scheme unless you have a separate answer-key function.
                enqueueAnswerText(String(clue?.answer ?? "").trim(), key, game.ttsProvider);
            }
        }
    }

    // Final Jeopardy (question + answer)
    for (const cats of boardData.finalJeopardy?.categories ?? []) {
        const q = String(cats[0]?.question ?? "").trim();
        const a = String(cats[0]?.answer ?? "").trim(); // FIX

        if (!q) continue;

        const key = `finalJeopardy:?:${q}`;

        enqueueClueText(q, key, game.ttsProvider);
        enqueueAnswerText(a, key, game.ttsProvider);
    }

    trace?.mark?.("imported_tts_ensure_begin", { jobs: jobs.length });
    await Promise.all(jobs);
    trace?.mark?.("imported_tts_ensure_end", { jobs: jobs.length });

    boardData.ttsAssetIds = Array.from(new Set([...boardData.ttsAssetIds, ...ttsState.ttsIds]));
    return boardData;
}

export function createBoardTtsState(): BoardTtsState {
    return {
        ttsPromises: [],
        ttsIds: new Set<string>(),
        ttsByClueKey: Object.create(null) as Record<string, string>,
        ttsByAnswerKey: Object.create(null) as Record<string, string>,
    };
}

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


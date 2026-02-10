/* eslint-disable @typescript-eslint/no-explicit-any */

import {
    ProgressTick,
    VisualSettings
} from "../services/ai/visuals.js";
import type {TtsProviderName} from "../services/tts/types.js";
import type { Limiter as TtsLimiter } from "../services/tts/limiter.js";

export type Trace = {
    mark?: (name: string, data?: any) => void;
};
export type AsyncLimiter = <T>(fn: () => Promise<T>) => Promise<T>;
// This matches your current ensureTtsAsset signature (old Polly style).
// Later we’ll replace this with your new providers-based ensureTtsAsset types.
export type EnsureTtsAssetParams = {
    text: string;
    textType: "text";      // you only use "text" currently in host.ts
    voiceId: string;
    engine: string;
    outputFormat: string;
    provider: string;
};

export type TtsAsset = { id: string };

export type AiHostTtsBank = {
    slotAssets: Record<string, string[]>;
    nameAssetsByPlayer: Record<string, string>;
    categoryAssetsByCategory: Record<string, string>;
    valueAssetsByValue: Record<string, string>;
    allAssetIds: string[];
};

export type Player = { name?: string | null };

export type Category =
    | string
    | {
    name?: string | null;
    category?: string | null;
};

export type Game = {
    lobbySettings?: { narrationEnabled?: boolean | null } | null;
    players?: Player[] | null;
    categories?: Category[] | null;
    boardData?: any;
    aiHostTts?: AiHostTtsBank | null;
};

export type Ctx = {
    repos: any;
    games: Game[];
    ensureTtsAsset: (
        params: EnsureTtsAssetParams,
        pool: any,
    ) => Promise<TtsAsset>;

    getTtsDurationMs: (assetId: string) => Promise<number>;
    modelsByValue: Record<string, any>;
    provider: string;

    broadcast: (gameId: string, msg: any) => void;
    sleep: (ms: number) => Promise<void>;

    plannedVisualSlots: (
        settings: Pick<VisualSettings, "includeVisuals" | "maxVisualCluesPerCategory">
    ) => number;

    makeLimiter: (maxConcurrent: number) => AsyncLimiter;

    getLimiter: (provider: TtsProviderName) => TtsLimiter;

    populateCategoryVisuals: (
        ctx: Ctx,
        cat: any,
        settings: VisualSettings,
        progressTick?: ProgressTick
    ) => Promise<void>;

    sleepAndCheckGame: (ms: number, gameId: string) => Promise<boolean>;
};

export type SayResult = { assetId: string; ms: number };

export type VoiceStep = {
    slot: string;
    pad?: number;
    after?: () => void | Promise<void>;
};

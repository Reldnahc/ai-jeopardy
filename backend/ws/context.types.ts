/* eslint-disable @typescript-eslint/no-explicit-any */
import {createWsContext} from "./context.js";

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
    finalJeopardyAnswersByPlayer: Record<string, string>;
    finalJeopardyWagersByPlayer: Record<string, string>;
    allAssetIds: string[];
};

export type Player = { name?: string | null };

export type Category =
    | string
    | {
    name?: string | null;
    category?: string | null;
};

type ActiveBoard = "firstBoard" | "secondBoard" | "finalJeopardy";

export type Game = {
    lobbySettings?: { narrationEnabled?: boolean | null } | null;
    players?: Player[] | null;
    categories?: Category[] | null;
    boardData?: any;
    aiHostTts?: AiHostTtsBank | null;
    activeBoard?: ActiveBoard;
    ttsProvider?: string | null;
};
export type Ctx = ReturnType<typeof createWsContext>;

export type SayResult = { assetId: string; ms: number };

export type VoiceStep = {
    slot?: string;
    assetId?: string;
    pad?: number;
    after?: () => void | Promise<void>;
};

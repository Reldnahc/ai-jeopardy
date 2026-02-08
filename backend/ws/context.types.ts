/* eslint-disable @typescript-eslint/no-explicit-any */

export type Trace = {
    mark?: (name: string, data?: any) => void;
};

// This matches your current ensureTtsAsset signature (old Polly style).
// Later we’ll replace this with your new providers-based ensureTtsAsset types.
export type EnsureTtsAssetParams = {
    text: string;
    textType: "text";      // you only use "text" currently in host.ts
    voiceId: string;
    engine: string;
    outputFormat: string;
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

    ensureTtsAsset: (
        params: EnsureTtsAssetParams,
        pool: any,
        trace?: Trace
    ) => Promise<TtsAsset>;

    getTtsDurationMs: (assetId: string) => Promise<number>;

    broadcast: (gameId: string, msg: any) => void;
    sleep: (ms: number) => Promise<void>;
};

export type SayResult = { assetId: string; ms: number };

export type VoiceStep = {
    slot: string;
    pad?: number;
    after?: () => void | Promise<void>;
};

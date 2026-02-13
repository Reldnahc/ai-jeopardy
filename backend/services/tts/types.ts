// backend/services/tts/board.ts

export type TtsProviderName = "piper" | "openai" | "kokoro";

export type TtsTextType = "text" | "ssml";

export type TtsOutputFormat = "mp3" | "wav"; // keep this small unless you truly need more

export interface TtsRequest {
    text: string;
    textType: TtsTextType;
    voiceId: string;
    engine: string; // provider-specific
    outputFormat: TtsOutputFormat;
    languageCode: string | null;

    /**
     * Optional explicit override. If omitted, providerSelector decides.
     */
    provider?: TtsProviderName | null;
}

export interface TtsSynthesisResult {
    audioBuffer: Buffer;
    meta?: Record<string, unknown>;
}

export interface TraceLike {
    mark?: (name: string, data?: Record<string, unknown>) => void;
}

export interface TtsProvider {
    name: TtsProviderName;
    supports: (req: TtsRequest) => boolean;
    synthesize: (req: TtsRequest) => Promise<TtsSynthesisResult>;
}

/**
 * Minimal shape your repos layer needs for step 2.
 * (Step 3 will change methods to provider-aware.)
 */
export interface TtsRepos {
    getIdBySha256Provider: (sha256: string, provider: TtsProviderName) => Promise<string | null>;

    upsertTtsAsset: (
        sha256: string,
        provider: TtsProviderName,
        audio: Buffer,
        bytes: number,
        text: string,
        textType: string,
        voiceId: string,
        engine: string,
        languageCode: string | null,
        contentType?: string
    ) => Promise<string | null>;
}

export interface EnsureTtsDeps {
    tts: TtsRepos;
}

export interface EnsureTtsResult {
    id: string;
    sha256: string;
    provider: TtsProviderName;
}

// backend/stt/types.ts
export type SttProbeResult = {
    text: string;
    hasSpeech: boolean;
    looksComprehensible: boolean;
};

export type SttProviderName = "openai" | "whisper";

export interface SttProvider {
    probe(args: {
        buffer: Buffer;
        mimeType: string;
        model?: string;
    }): Promise<SttProbeResult>;

    transcribe(args: {
        buffer: Buffer;
        mimeType: string;
        model?: string;
        language?: string;
        prompt?: string;
    }): Promise<string>;
}

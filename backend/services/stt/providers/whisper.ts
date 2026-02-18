// backend/stt/whisperUrlProvider.ts
import type {SttProbeResult, SttProvider} from "../types.js";
import {looksComprehensible} from "../prompt.js";

type WhisperResponse = {
    text?: string;
    language?: string;
    language_probability?: number;
    duration?: number;
    segments?: Array<{ start: number; end: number; text: string }>;
};

function safeJson(obj: unknown): string {
    try {
        return JSON.stringify(obj, null, 2);
    } catch {
        return String(obj);
    }
}

export class WhisperSttProvider implements SttProvider {
    private baseUrl: string;

    constructor(baseUrl: string) {
        this.baseUrl = String(baseUrl || "").replace(/\/+$/, "");
        if (!this.baseUrl) {
            throw new Error("WhisperSttProvider: missing baseUrl");
        }
    }

    async probe(args: {
        buffer: Buffer;
        mimeType: string;
        model?: string;
    }): Promise<SttProbeResult> {
        const text = await this.transcribe({
            buffer: args.buffer,
            mimeType: args.mimeType,
            // probe: no language, no prompt
            language: undefined,
            prompt: undefined,
        });

        return {
            text,
            hasSpeech: text.length > 0,
            looksComprehensible: looksComprehensible(text),
        };
    }

    async transcribe(args: {
        buffer: Buffer;
        mimeType: string;
        model?: string; // unused for this server (server decides)
        language?: string;
        prompt?: string;
    }): Promise<string> {
        const ct = String(args.mimeType || "audio/webm");

        // Node 18+ provides fetch/FormData/Blob globally
        const form = new FormData();

        const blob = new Blob([args.buffer], { type: ct });
        form.append("file", blob, "answer.webm");

        if (args.language) form.append("language", args.language);
        form.append("task", "transcribe");

        if (args.prompt) form.append("prompt", args.prompt);

        const url = `${this.baseUrl}/transcribe`;

        const res = await fetch(url, {
            method: "POST",
            body: form,
        });

        if (!res.ok) {
            const body = await res.text().catch(() => "");
            console.error("[stt] whisper-url failed", safeJson({ status: res.status, body }));
            throw new Error(`STT failed (whisper-url): status=${res.status} body=${body.slice(0, 500)}`);
        }

        const json = (await res.json().catch(() => null)) as WhisperResponse | null;
        return String(json?.text || "").trim();
    }
}

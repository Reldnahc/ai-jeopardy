// backend/stt/providers/openai.ts
import OpenAI, { toFile } from "openai";
import type { SttProvider, SttProbeResult } from "../types.js";
import { looksComprehensible } from "../prompt.js";
import {appConfig} from "../../../config/appConfig.js";

const openai = new OpenAI();

function safeJson(obj: unknown): string {
    try {
        return JSON.stringify(obj, null, 2);
    } catch {
        return String(obj);
    }
}

function describeOpenAiError(err: any) {
    return {
        name: err?.name,
        message: err?.message,
        status: err?.status,
        code: err?.code,
        type: err?.type,
        param: err?.param,
        request_id: err?.request_id,
        headers: err?.headers,
        error: err?.error,
        stack: err?.stack,
    };
}

export class OpenAiSttProvider implements SttProvider {
    async probe(args: {
        buffer: Buffer;
        mimeType: string;
        model?: string;
    }): Promise<SttProbeResult> {
        const model = args.model ?? appConfig.ai.sttModel;
        const ct = String(args.mimeType || "audio/webm");

        const file = await toFile(args.buffer, "answer.webm", { type: ct });

        // language-agnostic probe: no language, no prompt
        const resp = await openai.audio.transcriptions.create({
            model,
            file,
        });

        const text = String((resp as any)?.text || "").trim();

        return {
            text,
            hasSpeech: text.length > 0,
            looksComprehensible: looksComprehensible(text),
        };
    }

    async transcribe(args: {
        buffer: Buffer;
        mimeType: string;
        model?: string;
        language?: string;
        prompt?: string;
    }): Promise<string> {
        const model = args.model ?? appConfig.ai.sttModel;
        const ct = String(args.mimeType || "audio/webm");
        const file = await toFile(args.buffer, "answer.webm", { type: ct });

        const resp = await openai.audio.transcriptions.create({
            model,
            file,
            language: args.language,
            prompt: args.prompt,
        });

        return String((resp as any)?.text || "").trim();
    }
}

export function rethrowAsSttError(err: unknown): never {
    const info = describeOpenAiError(err as any);
    console.error("[stt] openai failed", safeJson(info));
    throw new Error(
        `STT failed: status=${info.status ?? "?"} message=${info.message ?? "?"} request_id=${info.request_id ?? "?"}`
    );
}

// backend/services/tts/dedupe.ts
import { createHash } from "crypto";
import type { TtsRequest, TtsProviderName } from "./types";

export function normalizeText(s: unknown): string {
    return String(s ?? "")
        .replace(/\r\n/g, "\n")
        .replace(/[ \t]+/g, " ")
        .replace(/\n{3,}/g, "\n\n")
        .trim();
}

export function ttsDedupeHash(payload: {
    provider: TtsProviderName;
    text: string;
    textType: string;
    voiceId: string;
    engine: string;
    outputFormat: string;
    languageCode: string | null;
}): string {
    const stable = {
        v: 1,
        provider: payload.provider,
        text: normalizeText(payload.text),
        textType: payload.textType,
        voiceId: payload.voiceId,
        engine: payload.engine,
        outputFormat: payload.outputFormat,
        languageCode: payload.languageCode ?? null,
    };

    return createHash("sha256").update(JSON.stringify(stable)).digest("hex");
}

/** Convenience to build hash from a request + chosen provider. */
export function hashForRequest(req: TtsRequest, provider: TtsProviderName): string {
    return ttsDedupeHash({
        provider,
        text: req.text,
        textType: req.textType,
        voiceId: req.voiceId,
        engine: req.engine,
        outputFormat: req.outputFormat,
        languageCode: req.languageCode,
    });
}

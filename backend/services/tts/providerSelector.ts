// backend/services/tts/providerSelector.ts
import type { TtsProvider, TtsRequest, TtsProviderName } from "./types.js";
import { getProviders } from "./providers/registry.js";

function stripPrefixVoice(voiceId: string): { provider: TtsProviderName | null; voiceId: string } {
    const v = String(voiceId ?? "");
    if (v.startsWith("piper:")) return { provider: "piper", voiceId: v.slice("piper:".length) };
    if (v.startsWith("openai:")) return { provider: "openai", voiceId: v.slice("openai:".length) };
    return { provider: null, voiceId: v };
}

export function selectProvider(req: TtsRequest): { provider: TtsProvider; effectiveReq: TtsRequest } {
    const providers = getProviders();

    // Voice prefix can implicitly set provider, and we also clean the prefix off voiceId.
    const { provider: prefProvider, voiceId: cleanedVoice } = stripPrefixVoice(req.voiceId);
    const effectiveReq: TtsRequest = { ...req, voiceId: cleanedVoice, provider: req.provider ?? prefProvider };

    if (effectiveReq.provider) {
        const p = providers.get(effectiveReq.provider);
        if (!p) throw new Error(`Unknown TTS provider: ${effectiveReq.provider}`);
        if (!p.supports(effectiveReq)) throw new Error(`Provider ${p.name} does not support this request`);
        return { provider: p, effectiveReq };
    }

    // Default routing: Piper first
    const order: TtsProviderName[] = ["piper", "openai"];
    for (const name of order) {
        const p = providers.get(name);
        if (p && p.supports(effectiveReq)) return { provider: p, effectiveReq };
    }

    throw new Error("No TTS provider supports this request");
}

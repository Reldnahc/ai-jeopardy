import type { TtsProvider, TtsRequest, TtsProviderName } from "./types.js";
import { getProviders } from "./providers/registry.js";

function splitVoicePrefix(voiceId: string): { provider: TtsProviderName | null; voiceId: string } {
    const raw = String(voiceId ?? "").trim();

    // allow "piper:amy", "kokoro:af_heart", "openai:alloy"
    const m = raw.match(/^([a-z0-9_-]+):(.+)$/i);
    if (!m) return { provider: null, voiceId: raw };

    const prov = m[1].toLowerCase() as TtsProviderName;
    const voice = String(m[2] ?? "").trim();

    // Only treat it as a prefix if it matches a registered provider name
    const providers = getProviders();
    if (!providers.has(prov)) return { provider: null, voiceId: raw };

    return { provider: prov, voiceId: voice };
}

export function selectProvider(req: TtsRequest): { provider: TtsProvider; effectiveReq: TtsRequest } {
    const providers = getProviders();

    // Prefix can set provider and also strips it from voiceId.
    const { provider: prefProvider, voiceId: cleanedVoice } = splitVoicePrefix(req.voiceId);

    const effectiveReq: TtsRequest = {
        ...req,
        voiceId: cleanedVoice,
        provider: req.provider ?? prefProvider,
    };

    if (effectiveReq.provider) {
        const p = providers.get(effectiveReq.provider);
        if (!p) throw new Error(`Unknown TTS provider: ${effectiveReq.provider}`);
        if (!p.supports(effectiveReq)) throw new Error(`Provider ${p.name} does not support this request`);
        return { provider: p, effectiveReq };
    }

    // Default routing (keep your preference order)
    const order: TtsProviderName[] = ["kokoro", "piper", "openai"];
    for (const name of order) {
        const p = providers.get(name);
        if (p && p.supports(effectiveReq)) return { provider: p, effectiveReq };
    }

    throw new Error("No TTS provider supports this request");
}

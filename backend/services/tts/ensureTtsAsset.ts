// backend/services/tts/ensureTtsAsset.ts
import type { EnsureTtsDeps, EnsureTtsResult, TtsRequest } from "./types.js";
import { normalizeText, hashForRequest } from "./dedupe.js";
import { selectProvider } from "./providerSelector.js";
import { getLimiter } from "./limiter.js";

export async function ensureTtsAsset(
    input: Partial<TtsRequest> & { text: string },
    repos: EnsureTtsDeps,
): Promise<EnsureTtsResult> {
    if (!repos?.tts) throw new Error("ensureTtsAsset: missing deps.repos.tts");

    const req: TtsRequest = {
        text: normalizeText(input.text),
        textType: input.textType ?? "text",
        voiceId: input.voiceId ?? "default",
        engine: input.engine ?? "default",
        outputFormat: input.outputFormat ?? "wav",
        languageCode: input.languageCode ?? null,
        provider: input.provider ?? null,
    };

    if (!req.text) throw new Error("TTS text is empty");

    const { provider, effectiveReq } = selectProvider(req);

    const sha256 = hashForRequest(effectiveReq, provider.name);

    const limiter = getLimiter(provider.name);

    return limiter.schedule(async () => {

        const existingId = await repos.tts.getIdBySha256Provider(
            sha256,
            provider.name
        );
        if (existingId) return { id: existingId, sha256, provider: provider.name };

        const { audioBuffer } = await provider.synthesize(effectiveReq);

        if (!audioBuffer.length) throw new Error(`${provider.name} returned empty audio`);

        const id = await repos.tts.upsertTtsAsset(
            sha256,
            provider.name,
            audioBuffer,
            audioBuffer.length,
            effectiveReq.text,
            effectiveReq.textType,
            effectiveReq.voiceId,
            effectiveReq.engine,
            effectiveReq.languageCode
        );

        if (!id) throw new Error("Failed to upsert tts_assets");
        return { id, sha256, provider: provider.name };
    });
}

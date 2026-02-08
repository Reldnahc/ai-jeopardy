// backend/services/tts/ensureTtsAsset.ts
import type { EnsureTtsDeps, EnsureTtsResult, TraceLike, TtsRequest } from "./types";
import { normalizeText, hashForRequest } from "./dedupe";
import { selectProvider } from "./providerSelector";
import { getLimiter } from "./limiter";

export async function ensureTtsAsset(
    input: Partial<TtsRequest> & { text: string },
    repos: EnsureTtsDeps,
    trace?: TraceLike
): Promise<EnsureTtsResult> {
    if (!repos?.tts) throw new Error("ensureTtsAsset: missing deps.repos.tts");

    const req: TtsRequest = {
        text: normalizeText(input.text),
        textType: input.textType ?? "text",
        voiceId: input.voiceId ?? "default",
        engine: input.engine ?? "default",
        outputFormat: input.outputFormat ?? "mp3",
        languageCode: input.languageCode ?? null,
        provider: input.provider ?? null,
    };

    if (!req.text) throw new Error("TTS text is empty");

    const { provider, effectiveReq } = selectProvider(req);

    // IMPORTANT: provider-aware hash
    const sha256 = hashForRequest(effectiveReq, provider.name);

    const limiter = getLimiter(provider.name);

    return limiter.schedule(async () => {
        trace?.mark?.("tts_db_lookup_start", { provider: provider.name });

        // Step 3: this must become provider-aware in the repo.

        const existingId = await repos.tts.getIdBySha256Provider(
            sha256,
            provider.name
        );

        trace?.mark?.("tts_db_lookup_end", { hit: Boolean(existingId), provider: provider.name });
        if (existingId) return { id: existingId, sha256, provider: provider.name };

        trace?.mark?.("tts_synth_start", { provider: provider.name });

        const { audioBuffer } = await provider.synthesize(effectiveReq, { trace });

        trace?.mark?.("tts_synth_end", { provider: provider.name, bytes: audioBuffer.length });

        if (!audioBuffer.length) throw new Error(`${provider.name} returned empty audio`);

        trace?.mark?.("tts_db_upsert_start", { provider: provider.name });

        // Step 3: include provider in the upsert and conflict target.
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

        trace?.mark?.("tts_db_upsert_end", { provider: provider.name });

        if (!id) throw new Error("Failed to upsert tts_assets");
        return { id, sha256, provider: provider.name };
    });
}

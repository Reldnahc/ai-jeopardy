// backend/services/ttsDurationService.js
import { estimateMp3DurationMsFromHeaderBytes } from "./mp3Duration.js";

export function createTtsDurationService( repos ) {
    if (!repos?.tts) throw new Error("createTtsDurationService: missing repos.tts");

    const cache = new Map();

    async function getDurationMs(assetId) {
        if (!assetId) return null;
        if (cache.has(assetId)) return cache.get(assetId);

        const row = await repos.tts.getBinaryById(assetId);
        if (!row?.data) return null;

        const headerBytes = row.data.subarray(0, 8192);
        const ms = estimateMp3DurationMsFromHeaderBytes(
            headerBytes,
            Number(row.bytes || row.data.length)
        );

        if (ms != null) cache.set(assetId, ms);
        return ms ?? null;
    }

    return { getDurationMs };
}

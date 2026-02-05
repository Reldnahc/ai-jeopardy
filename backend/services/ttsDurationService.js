// backend/services/ttsDurationService.js
import { estimateMp3DurationMsFromHeaderBytes } from "./mp3Duration.js";

export function createTtsDurationService({ pool }) {
    const cache = new Map();

    async function getDurationMs(assetId) {
        if (!assetId) return null;
        if (cache.has(assetId)) return cache.get(assetId);

        const { rows } = await pool.query(
            `select data, bytes from public.tts_assets where id = $1 limit 1`,
            [assetId]
        );

        const row = rows?.[0];
        if (!row?.data) return null;

        const headerBytes = row.data.subarray(0, 8192);
        const ms = estimateMp3DurationMsFromHeaderBytes({
            headerBytes,
            totalBytes: Number(row.bytes || row.data.length),
        });

        if (ms != null) cache.set(assetId, ms);
        return ms ?? null;
    }

    return { getDurationMs };
}

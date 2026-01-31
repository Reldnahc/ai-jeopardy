import { GetObjectCommand } from "@aws-sdk/client-s3";
import { estimateMp3DurationMsFromHeaderBytes } from "./mp3Duration.js";

async function streamToBuffer(stream) {
    const chunks = [];
    for await (const chunk of stream) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    return Buffer.concat(chunks);
}

export function createTtsDurationService({ supabase, r2 }) {
    const cache = new Map(); // assetId -> durationMs (number)

    async function getDurationMs(assetId) {
        if (!assetId) return null;
        if (cache.has(assetId)) return cache.get(assetId);

        const { data, error } = await supabase
            .from("tts_assets")
            .select("storage_key, bytes, content_type")
            .eq("id", assetId)
            .single();

        if (error || !data?.storage_key || !data?.bytes) return null;

        // Pull only the first few KB to parse the first MP3 frame header.
        const obj = await r2.send(new GetObjectCommand({
            Bucket: process.env.R2_BUCKET,
            Key: data.storage_key,
            Range: "bytes=0-8191",
        }));

        const headerBytes = await streamToBuffer(obj.Body);

        const ms = estimateMp3DurationMsFromHeaderBytes({
            headerBytes,
            totalBytes: Number(data.bytes),
        });

        if (ms != null) cache.set(assetId, ms);
        return ms ?? null;
    }

    return { getDurationMs };
}

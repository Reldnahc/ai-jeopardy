// services/imageAssetService.js
import crypto from "crypto";
import sharp from "sharp";
import { PutObjectCommand } from "@aws-sdk/client-s3";
import { r2 } from "./r2Client.js";

const UA = "AI-Jeopardy/1.0";

const MAX_WIDTH = 1024;   // was 1280
const QUALITY = 50;       // was 82
const EFFORT = 3;         // 0-6 (6 is slowest/best compression)

export async function ingestImageToR2FromUrl(imageUrl, meta, supabase, trace) {
    if (!process.env.R2_BUCKET) throw new Error("Missing R2_BUCKET env var");
    trace?.mark("img_dl_start");
    const r = await fetch(imageUrl, { headers: { "User-Agent": UA } });
    trace?.mark("img_dl_end", { status: r.status });
    if (!r.ok) throw new Error(`Image download failed: ${r.status}`);
    const inputBytes = Buffer.from(await r.arrayBuffer());
    trace?.mark("img_encode_start");
    const webpBuffer = await sharp(inputBytes)
        .rotate()
        .resize({ width: MAX_WIDTH , withoutEnlargement: true })
        .webp({ quality: QUALITY, effort: EFFORT })
        .toBuffer();
    trace?.mark("img_encode_end", { bytes: webpBuffer.length });

    const info = await sharp(webpBuffer).metadata();

    const sha256 = crypto.createHash("sha256").update(webpBuffer).digest("hex");
    const storageKey = `images/sha256/${sha256}.webp`;

    // Hard dedupe (DB)
    trace?.mark("img_db_lookup_start");
    const existing = await supabase
        .from("image_assets")
        .select("id")
        .eq("sha256", sha256)
        .maybeSingle();
    trace?.mark("img_db_lookup_end", { hit: Boolean(existing?.data?.id) });
    if (existing?.data?.id) return existing.data.id;

    // Upload to R2 (idempotent by key)
    trace?.mark("img_r2_put_start");
    await r2.send(
        new PutObjectCommand({
            Bucket: process.env.R2_BUCKET,
            Key: storageKey,
            Body: webpBuffer,
            ContentType: "image/webp",
            CacheControl: "public, max-age=31536000, immutable",
        })
    );
    trace?.mark("img_r2_put_end");
    const row = {
        storage_key: storageKey,
        sha256,
        content_type: "image/webp",
        bytes: webpBuffer.length,
        width: info.width ?? null,
        height: info.height ?? null,
        source_url: meta?.sourceUrl ?? null,
        license: meta?.licenseUrl
            ? `${meta?.license ?? ""} ${meta?.licenseUrl}`.trim()
            : (meta?.license ?? null),
        attribution: meta?.attribution ?? null,
    };
    trace?.mark("img_db_insert_start");
    const inserted = await supabase
        .from("image_assets")
        .insert(row)
        .select("id")
        .maybeSingle();
    trace?.mark("img_db_insert_end");

    if (inserted?.data?.id) return inserted.data.id;

    // Race fallback
    const again = await supabase
        .from("image_assets")
        .select("id")
        .eq("sha256", sha256)
        .single();

    return again.data.id;
}

export function collectImageAssetIdsFromBoard(boardData) {
    const ids = new Set();

    const collect = (categories) => {
        (categories ?? []).forEach((cat) => {
            (cat.values ?? []).forEach((clue) => {
                const media = clue?.media;
                if (media?.type === "image" && typeof media.assetId === "string" && media.assetId.trim()) {
                    ids.add(media.assetId.trim());
                }
            });
        });
    };

    collect(boardData?.firstBoard?.categories);
    collect(boardData?.secondBoard?.categories);
    collect(boardData?.finalJeopardy?.categories);

    return Array.from(ids);
}
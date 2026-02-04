// services/imageAssetService.js
import crypto from "crypto";
import sharp from "sharp";
import { PutObjectCommand } from "@aws-sdk/client-s3";
import { r2 } from "./r2Client.js";

const UA = "AI-Jeopardy/1.0";

const MAX_WIDTH = 1024;   // was 1280
const QUALITY = 50;       // was 82
const EFFORT = 3;         // 0-6 (6 is slowest/best compression)

export async function ingestImageToR2FromUrl(imageUrl, meta, pool, trace) {
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
    const existing = await pool.query(
        `select id from public.image_assets where sha256 = $1 limit 1`,
        [sha256]
    );
    trace?.mark("img_db_lookup_end", { hit: Boolean(existing?.data?.id) });
    if (existing.rows?.[0]?.id) return existing.rows[0].id;

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

    trace?.mark("img_db_insert_start");
    const inserted = await pool.query(
        `
          insert into public.image_assets
            (storage_key, sha256, content_type, bytes, width, height, source_url, license, attribution)
          values
            ($1,$2,$3,$4,$5,$6,$7,$8,$9)
          on conflict (sha256)
          do update set sha256 = excluded.sha256
          returning id
          `,
        [
            storageKey,
            sha256,
            "image/webp",
            webpBuffer.length,
            info.width ?? null,
            info.height ?? null,
            meta?.sourceUrl ?? null,
            meta?.licenseUrl
                ? `${meta?.license ?? ""} ${meta?.licenseUrl}`.trim()
                : (meta?.license ?? null),
            meta?.attribution ?? null,
        ]
    );

    const id = inserted.rows?.[0]?.id;
    if (!id) throw new Error("Failed to upsert image_assets row");
    return id;
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
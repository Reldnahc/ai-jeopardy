// services/imageAssetService.js
import crypto from "crypto";
import sharp from "sharp";

const UA = "AI-Jeopardy/1.0";

const MAX_WIDTH = 1024;   // was 1280
const QUALITY = 50;       // was 82
const EFFORT = 3;         // 0-6 (6 is slowest/best compression)

export async function ingestImageToDbFromUrl(imageUrl, meta, pool) {
    const r = await fetch(imageUrl, { headers: { "User-Agent": UA } });
    if (!r.ok) throw new Error(`Image download failed: ${r.status}`);

    const inputBytes = Buffer.from(await r.arrayBuffer());

    const webpBuffer = await sharp(inputBytes)
        .rotate()
        .resize({ width: MAX_WIDTH, withoutEnlargement: true })
        .webp({ quality: QUALITY, effort: EFFORT })
        .toBuffer();

    const info = await sharp(webpBuffer).metadata();
    const sha256 = crypto.createHash("sha256").update(webpBuffer).digest("hex");

    const hit = await pool.query(
        `select id from public.image_assets where sha256 = $1 limit 1`,
        [sha256]
    );
    const existingId = hit.rows?.[0]?.id;
    if (existingId) return existingId;

    const up = await pool.query(
        `
    insert into public.image_assets
      (storage_key, sha256, content_type, data, bytes, width, height, source_url, license, attribution)
    values
      (null, $1, 'image/webp', $2, $3, $4, $5, $6, $7, $8)
    on conflict (sha256)
    do update set sha256 = excluded.sha256
    returning id
    `,
        [
            sha256,
            webpBuffer,
            webpBuffer.length,
            info.width ?? null,
            info.height ?? null,
            meta?.sourceUrl ?? null,
            meta?.licenseUrl ? `${meta?.license ?? ""} ${meta?.licenseUrl}`.trim() : (meta?.license ?? null),
            meta?.attribution ?? null,
        ]
    );

    const id = up.rows?.[0]?.id;
    if (!id) throw new Error("Failed to upsert image_assets");
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
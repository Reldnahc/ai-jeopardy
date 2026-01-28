// services/imageAssetService.js
import crypto from "crypto";
import sharp from "sharp";
import { PutObjectCommand } from "@aws-sdk/client-s3";
import { r2 } from "./r2Client.js";

const UA = "AI-Jeopardy/1.0";

export async function ingestImageToR2FromUrl(imageUrl, meta, supabase) {
    if (!process.env.R2_BUCKET) throw new Error("Missing R2_BUCKET env var");

    const r = await fetch(imageUrl, { headers: { "User-Agent": UA } });
    if (!r.ok) throw new Error(`Image download failed: ${r.status}`);
    const inputBytes = Buffer.from(await r.arrayBuffer());

    const webpBuffer = await sharp(inputBytes)
        .rotate()
        .resize({ width: 1280, withoutEnlargement: true })
        .webp({ quality: 82 })
        .toBuffer();

    const info = await sharp(webpBuffer).metadata();

    const sha256 = crypto.createHash("sha256").update(webpBuffer).digest("hex");
    const storageKey = `images/sha256/${sha256}.webp`;

    // Hard dedupe (DB)
    const existing = await supabase
        .from("image_assets")
        .select("id")
        .eq("sha256", sha256)
        .maybeSingle();

    if (existing?.data?.id) return existing.data.id;

    // Upload to R2 (idempotent by key)
    await r2.send(
        new PutObjectCommand({
            Bucket: process.env.R2_BUCKET,
            Key: storageKey,
            Body: webpBuffer,
            ContentType: "image/webp",
            CacheControl: "public, max-age=31536000, immutable",
        })
    );

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

    const inserted = await supabase
        .from("image_assets")
        .insert(row)
        .select("id")
        .maybeSingle();

    if (inserted?.data?.id) return inserted.data.id;

    // Race fallback
    const again = await supabase
        .from("image_assets")
        .select("id")
        .eq("sha256", sha256)
        .single();

    return again.data.id;
}

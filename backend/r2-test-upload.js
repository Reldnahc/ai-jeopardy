import crypto from "crypto";
import fs from "fs/promises";
import path from "path";
import sharp from "sharp";
import { PutObjectCommand } from "@aws-sdk/client-s3";

import { r2 } from "./services/r2Client.js";
import { supabase } from "./config/database.js";

function requireEnv(name) {
    const v = process.env[name];
    if (!v) throw new Error(`Missing env var: ${name}`);
    return v;
}

const BUCKET = requireEnv("R2_BUCKET");

// Usage:
// node scripts/ingestSampleImage.js ./sample.jpg
// (supports png/jpg/webp/etc)
async function main() {
    const inputPath = process.argv[2];
    if (!inputPath) {
        console.error("Usage: node scripts/ingestSampleImage.js <path-to-image>");
        process.exit(1);
    }

    const inputBytes = await fs.readFile(inputPath);

    // Normalize:
    // - rotate() respects EXIF orientation
    // - resize() makes size consistent (helps dedupe)
    // - webp() strips metadata by default
    const normalized = sharp(inputBytes)
        .rotate()
        .resize({ width: 1280, withoutEnlargement: true })
        .webp({ quality: 82 });

    const webpBuffer = await normalized.toBuffer();
    const meta = await sharp(webpBuffer).metadata();

    const sha256 = crypto.createHash("sha256").update(webpBuffer).digest("hex");
    const storageKey = `images/sha256/${sha256}.webp`;

    // 1) DB check (fast path)
    const existing = await supabase
        .from("image_assets")
        .select("id, storage_key")
        .eq("sha256", sha256)
        .maybeSingle();

    if (existing.data?.id) {
        console.log("✅ Already exists (deduped)");
        console.log("assetId:", existing.data.id);
        console.log("storage_key:", existing.data.storage_key);
        return;
    }

    // 2) Upload to R2 (idempotent because key is sha256)
    await r2.send(
        new PutObjectCommand({
            Bucket: BUCKET,
            Key: storageKey,
            Body: webpBuffer,
            ContentType: "image/webp",
            CacheControl: "public, max-age=31536000, immutable",
        })
    );

    // 3) Insert DB row (handle race by catching unique violation and re-selecting)
    const row = {
        storage_key: storageKey,
        sha256,
        content_type: "image/webp",
        bytes: webpBuffer.length,
        width: meta.width ?? null,
        height: meta.height ?? null,
        source_url: `local:${path.resolve(inputPath)}`, // for testing; replace later
        license: null,
        attribution: null,
    };

    const inserted = await supabase.from("image_assets").insert(row).select("id").maybeSingle();

    if (inserted.data?.id) {
        console.log("✅ Uploaded + DB row created");
        console.log("assetId:", inserted.data.id);
        console.log("sha256:", sha256);
        console.log("storage_key:", storageKey);
        return;
    }

    // If insert failed due to conflict or something weird, fall back to re-select
    const again = await supabase
        .from("image_assets")
        .select("id, storage_key")
        .eq("sha256", sha256)
        .single();

    console.log("✅ Uploaded + row already existed (race handled)");
    console.log("assetId:", again.data.id);
    console.log("storage_key:", again.data.storage_key);
}

main().catch((err) => {
    console.error("❌ ingestSampleImage failed");
    console.error(err);
    process.exit(1);
});

// backend/services/imageAssetService.js
import crypto from "crypto";
import sharp from "sharp";

const UA = "AI-Jeopardy/1.0";

const MAX_WIDTH = 1024;
const QUALITY = 50;
const EFFORT = 3;

type ImageMeta = {
  sourceUrl?: string | null;
  license?: string | null;
  licenseUrl?: string | null;
  attribution?: string | null;
  [key: string]: unknown;
};

type ImageRepos = {
  images?: {
    getIdBySha256(sha256: string): Promise<string | null>;
    upsertImageAsset(
      sha256: string,
      bytes: Buffer,
      size: number,
      width: number | null,
      height: number | null,
      sourceUrl: string | null,
      license: string | null,
      attribution: string | null,
    ): Promise<string | null>;
  };
};

type BoardLike = {
  firstBoard?: { categories?: Array<{ values?: Array<{ media?: { type?: string; assetId?: string } }> }> };
  secondBoard?: { categories?: Array<{ values?: Array<{ media?: { type?: string; assetId?: string } }> }> };
  finalJeopardy?: { categories?: Array<{ values?: Array<{ media?: { type?: string; assetId?: string } }> }> };
};

export async function ingestImageToDbFromUrl(
  imageUrl: string,
  meta: ImageMeta,
  repos: ImageRepos,
): Promise<string> {
  if (!repos?.images) throw new Error("ingestImageToDbFromUrl: missing deps.repos.images");

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

  const existingId = await repos.images.getIdBySha256(sha256);
  if (existingId) return existingId;

  const license = meta?.licenseUrl
    ? `${meta?.license ?? ""} ${meta?.licenseUrl}`.trim()
    : (meta?.license ?? null);

  const id = await repos.images.upsertImageAsset(
    sha256,
    webpBuffer,
    webpBuffer.length,
    info.width ?? null,
    info.height ?? null,
    meta?.sourceUrl ?? null,
    license,
    meta?.attribution ?? null,
  );

  if (!id) throw new Error("Failed to upsert image_assets");
  return id;
}

export function collectImageAssetIdsFromBoard(boardData: BoardLike | null | undefined): string[] {
  const ids = new Set<string>();

  const collect = (
    categories: Array<{ values?: Array<{ media?: { type?: string; assetId?: string } }> }> = [],
  ) => {
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

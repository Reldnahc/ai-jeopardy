// backend/repositories/imageAssetRepository.js

export function createImageAssetRepository( pool ) {
    if (!pool) throw new Error("createImageAssetRepository: missing pool");

    async function getImageBinaryById(assetId) {
        const { rows } = await pool.query(
            `select data, bytes, content_type
       from public.image_assets
       where id = $1
       limit 1`,
            [assetId]
        );
        return rows?.[0] ?? null;
    }

    async function getImageMetaById(assetId) {
        const { rows } = await pool.query(
            `select storage_key, content_type
       from public.image_assets
       where id = $1
       limit 1`,
            [assetId]
        );
        return rows?.[0] ?? null;
    }

    async function getIdBySha256(sha256) {
        const { rows } = await pool.query(
            `select id
       from public.image_assets
       where sha256 = $1
       limit 1`,
            [sha256]
        );
        return rows?.[0]?.id ?? null;
    }

    async function upsertImageAsset(
                                        sha256,
                                        webpBuffer,
                                        bytes,
                                        width,
                                        height,
                                        sourceUrl,
                                        license,
                                        attribution,
                                    ) {
        const { rows } = await pool.query(
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
                bytes,
                width ?? null,
                height ?? null,
                sourceUrl ?? null,
                license ?? null,
                attribution ?? null,
            ]
        );

        return rows?.[0]?.id ?? null;
    }

    return {
        getImageBinaryById,
        getImageMetaById,
        getIdBySha256,
        upsertImageAsset,
    };
}

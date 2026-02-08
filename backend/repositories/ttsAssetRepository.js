// backend/repositories/ttsAssetRepository.js

export function createTtsAssetRepository( pool ) {
    if (!pool) throw new Error("createTtsAssetRepository: missing pool");

    async function getBinaryById(assetId) {
        const { rows } = await pool.query(
            `select data, bytes, content_type
       from public.tts_assets
       where id = $1
       limit 1`,
            [assetId]
        );
        return rows?.[0] ?? null;
    }

    async function getMetaById(assetId) {
        const { rows } = await pool.query(
            `select storage_key, content_type
       from public.tts_assets
       where id = $1
       limit 1`,
            [assetId]
        );
        return rows?.[0] ?? null;
    }

    async function getIdBySha256(sha256) {
        const { rows } = await pool.query(
            `select id
       from public.tts_assets
       where sha256 = $1
       limit 1`,
            [sha256]
        );
        return rows?.[0]?.id ?? null;
    }

    async function upsertTtsAsset(
        sha256,
        provider,
        audioBuffer,
        bytes,
        normalizedText,
        textType,
        voiceId,
        engine,
        languageCode,
        contentType = "audio/wav"
    ) {
        const { rows } = await pool.query(
            `
                insert into public.tts_assets
                (sha256, provider, storage_key, content_type, data, bytes, text, text_type, voice_id, engine, language_code)
                values
                    ($1, $2, null, $3, $4, $5, $6, $7, $8, $9, $10)
                on conflict (sha256, provider)
                    do update set
                                  data = excluded.data,
                                  bytes = excluded.bytes,
                                  content_type = excluded.content_type
                returning id
            `,
            [
                sha256,
                provider,
                contentType,
                audioBuffer,
                bytes,
                normalizedText,
                textType,
                voiceId,
                engine,
                languageCode,
            ]
        );

        return rows?.[0]?.id ?? null;
    }
    async function getIdBySha256Provider(sha256, provider) {
        const { rows } = await pool.query(
            `select id
         from public.tts_assets
         where sha256 = $1
           and provider = $2
         limit 1`,
            [sha256, provider]
        );
        return rows?.[0]?.id ?? null;
    }
    return {
        getBinaryById,
        getMetaById,
        getIdBySha256,
        upsertTtsAsset,
        getIdBySha256Provider
    };
}

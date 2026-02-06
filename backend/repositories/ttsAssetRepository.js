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
                                      mp3Buffer,
                                      bytes,
                                      normalizedText,
                                      textType,
                                      voiceId,
                                      engine,
                                      languageCode,
                                  ) {
        const { rows } = await pool.query(
            `
      insert into public.tts_assets
        (sha256, storage_key, content_type, data, bytes, text, text_type, voice_id, engine, language_code)
      values
        ($1, null, 'audio/mpeg', $2, $3, $4, $5, $6, $7, $8)
      on conflict (sha256)
      do update set sha256 = excluded.sha256
      returning id
      `,
            [
                sha256,
                mp3Buffer,
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

    return {
        getBinaryById,
        getMetaById,
        getIdBySha256,
        upsertTtsAsset,
    };
}

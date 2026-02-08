// backend/repositories/ttsAssetRepository.ts
import type { Pool } from "pg";

export interface TtsBinaryRow {
    data: Buffer;
    bytes: number;
    content_type: string;
}

export interface TtsMetaRow {
    storage_key: string | null;
    content_type: string;
}

export function createTtsAssetRepository(pool: Pool) {
    if (!pool) throw new Error("createTtsAssetRepository: missing pool");

    async function getBinaryById(assetId: string): Promise<TtsBinaryRow | null> {
        const { rows } = await pool.query<TtsBinaryRow>(
            `select data, bytes, content_type
             from public.tts_assets
             where id = $1
             limit 1`,
            [assetId]
        );
        return rows?.[0] ?? null;
    }

    async function getMetaById(assetId: string): Promise<TtsMetaRow | null> {
        const { rows } = await pool.query<TtsMetaRow>(
            `select storage_key, content_type
             from public.tts_assets
             where id = $1
             limit 1`,
            [assetId]
        );
        return rows?.[0] ?? null;
    }

    async function getIdBySha256(sha256: string): Promise<string | null> {
        const { rows } = await pool.query<{ id: string }>(
            `select id
             from public.tts_assets
             where sha256 = $1
             limit 1`,
            [sha256]
        );
        return rows?.[0]?.id ?? null;
    }

    async function getIdBySha256Provider(sha256: string, provider: string): Promise<string | null> {
        const { rows } = await pool.query<{ id: string }>(
            `select id
             from public.tts_assets
             where sha256 = $1
               and provider = $2
             limit 1`,
            [sha256, provider]
        );
        return rows?.[0]?.id ?? null;
    }

    async function upsertTtsAsset(
        sha256: string,
        provider: string,
        audioBuffer: Buffer,
        bytes: number,
        normalizedText: string,
        textType: string,
        voiceId: string,
        engine: string,
        languageCode: string,
        contentType: string = "audio/wav"
    ): Promise<string | null> {
        const { rows } = await pool.query<{ id: string }>(
            `
                insert into public.tts_assets
                (sha256, provider, storage_key, content_type, data, bytes,
                 text, text_type, voice_id, engine, language_code)
                values
                    ($1, $2, null, $3, $4, $5, $6, $7, $8, $9, $10)
                on conflict (sha256, provider)
                    do update set
                                  data = excluded.data,
                                  bytes = excluded.bytes,
                                  content_type = excluded.content_type
                returning id
            `,
            [sha256, provider, contentType, audioBuffer, bytes, normalizedText, textType, voiceId, engine, languageCode]
        );

        return rows?.[0]?.id ?? null;
    }

    return { getBinaryById, getMetaById, getIdBySha256, upsertTtsAsset, getIdBySha256Provider };
}

// backend/services/ttsAssetService.js
import crypto from "crypto";
import { HeadObjectCommand } from "@aws-sdk/client-s3";
import { PollyClient, SynthesizeSpeechCommand } from "@aws-sdk/client-polly";

/**
 * GLOBAL TTS SCHEDULER
 * - Limits concurrent "heavy" TTS work (Polly + DB insert)
 * - Adds slight spacing between job starts to avoid bursty rate limits
 *
 * Tune with:
 *   TTS_CONCURRENCY (default 2)
 *   TTS_MIN_DELAY_MS (default 120)
 */
const TTS_CONCURRENCY = Number( 5);
const TTS_MIN_DELAY_MS = Number(10);

let _ttsActive = 0;
let _ttsLastStart = 0;
const _ttsQueue = [];

/** Schedule a unit of work through the global TTS limiter. */
function scheduleTtsWork(fn) {
    return new Promise((resolve, reject) => {
        _ttsQueue.push({ fn, resolve, reject });
        drainTtsQueue();
    });
}

function drainTtsQueue() {
    if (_ttsActive >= TTS_CONCURRENCY) return;
    if (_ttsQueue.length === 0) return;

    const now = Date.now();
    const waitMs = Math.max(0, TTS_MIN_DELAY_MS - (now - _ttsLastStart));

    if (waitMs > 0) {
        setTimeout(drainTtsQueue, waitMs);
        return;
    }

    const job = _ttsQueue.shift();
    _ttsActive++;
    _ttsLastStart = Date.now();

    (async () => {
        try {
            const res = await job.fn();
            job.resolve(res);
        } catch (err) {
            job.reject(err);
        } finally {
            _ttsActive--;
            drainTtsQueue();
        }
    })();
}

// ------------------ helpers ------------------

function normalizeText(s) {
    return String(s ?? "")
        .replace(/\r\n/g, "\n")
        .replace(/[ \t]+/g, " ")
        .replace(/\n{3,}/g, "\n\n")
        .trim();
}

/**
 * Build a deterministic hash for dedupe BEFORE calling Polly.
 * This should include all params that affect the generated audio.
 */
function ttsDedupeHash({ text, textType, voiceId, engine, outputFormat, languageCode }) {
    const payload = {
        v: 1,
        text: normalizeText(text),
        textType: textType || "text",
        voiceId: voiceId || "Matthew",
        engine: engine || "standard",
        outputFormat: outputFormat || "mp3",
        languageCode: languageCode || null,
    };
    return crypto.createHash("sha256").update(JSON.stringify(payload)).digest("hex");
}

async function streamToBuffer(stream) {
    // Polly returns AudioStream as a Node Readable in most server environments.
    // But we handle a few possible shapes to be safe.
    if (!stream) return Buffer.alloc(0);

    // If it's already a Uint8Array/Buffer
    if (Buffer.isBuffer(stream)) return stream;
    if (stream instanceof Uint8Array) return Buffer.from(stream);

    // If it looks like a web ReadableStream
    if (typeof stream.getReader === "function") {
        const reader = stream.getReader();
        const chunks = [];
        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            chunks.push(Buffer.from(value));
        }
        return Buffer.concat(chunks);
    }

    // Node Readable
    const chunks = [];
    for await (const chunk of stream) {
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }
    return Buffer.concat(chunks);
}

function makePollyClient() {
    // Prefer AWS_REGION if provided, otherwise a safe default.
    const region = process.env.AWS_REGION || "us-east-1";
    return new PollyClient({ region });
}

export async function ensureTtsAsset(
    {
        text,
        textType = "text",
        voiceId = "Matthew",
        engine = "standard",
        outputFormat = "mp3",
        languageCode = null,
    },
    pool,
    trace
) {
    const normalizedText = normalizeText(text);
    if (!normalizedText) throw new Error("TTS text is empty");

    const sha256 = ttsDedupeHash({
        text: normalizedText,
        textType,
        voiceId,
        engine,
        outputFormat,
        languageCode,
    });

    return scheduleTtsWork(async () => {
        trace?.mark?.("tts_db_lookup_start");

        const hit = await pool.query(
            `select id from public.tts_assets where sha256 = $1 limit 1`,
            [sha256]
        );

        const existingId = hit.rows?.[0]?.id;
        trace?.mark?.("tts_db_lookup_end", { hit: Boolean(existingId) });
        if (existingId) return { id: existingId, sha256 };

        // Synthesize
        trace?.mark?.("tts_polly_start");
        const polly = makePollyClient();

        const synthInput = {
            OutputFormat: outputFormat,
            Text: normalizedText,
            TextType: textType,
            VoiceId: voiceId,
            Engine: engine,
        };
        if (languageCode) synthInput.LanguageCode = languageCode;

        const resp = await polly.send(new SynthesizeSpeechCommand(synthInput));
        const mp3Buffer = await streamToBuffer(resp.AudioStream);
        trace?.mark?.("tts_polly_end", { bytes: mp3Buffer.length });

        if (!mp3Buffer.length) throw new Error("Polly returned empty audio");

        // DB insert (race-safe)
        trace?.mark?.("tts_db_upsert_start");
        const up = await pool.query(
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
                mp3Buffer.length,
                normalizedText,
                textType,
                voiceId,
                engine,
                languageCode,
            ]
        );
        trace?.mark?.("tts_db_upsert_end");

        const id = up.rows?.[0]?.id;
        if (!id) throw new Error("Failed to upsert tts_assets");
        return { id, sha256 };
    });
}

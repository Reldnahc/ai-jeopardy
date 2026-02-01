// backend/services/ttsAssetService.js
import crypto from "crypto";
import { HeadObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";
import { PollyClient, SynthesizeSpeechCommand } from "@aws-sdk/client-polly";
import { r2 } from "./r2Client.js";

/**
 * GLOBAL TTS SCHEDULER
 * - Limits concurrent "heavy" TTS work (Polly + R2 + DB insert)
 * - Adds slight spacing between job starts to avoid bursty rate limits
 *
 * Tune with:
 *   TTS_CONCURRENCY (default 2)
 *   TTS_MIN_DELAY_MS (default 120)
 */
const TTS_CONCURRENCY = Number( 2);
const TTS_MIN_DELAY_MS = Number(120);

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

async function sleep(ms) {
    await new Promise((r) => setTimeout(r, ms));
}

async function waitForR2Readable({ bucket, key, trace, attempts = 7 }) {
    // Very short backoff; we only need to bridge immediate consistency gaps
    for (let i = 0; i < attempts; i++) {
        try {
            await r2.send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
            trace?.mark?.("tts_r2_head_ok", { attempt: i });
            return true;
        } catch (e) {
            const msg = String(e?.name || "") + " " + String(e?.message || "");
            const isNotFound =
                msg.includes("NotFound") ||
                msg.includes("NoSuchKey") ||
                msg.includes("404");

            trace?.mark?.("tts_r2_head_wait", { attempt: i, isNotFound });

            // If it’s a real error (permissions, outage), don’t spin forever
            if (!isNotFound) throw e;

            // backoff: 60, 100, 160, 250, 400, 650, 1000...
            const delay = Math.min(1200, Math.round(60 * Math.pow(1.6, i)));
            await sleep(delay);
        }
    }

    return false;
}

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
function ttsDedupeHash({
                           text,
                           textType,
                           voiceId,
                           engine,
                           outputFormat,
                           languageCode,
                       }) {
    const payload = {
        v: 1, // version your hashing scheme
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

/**
 * Ensure a TTS mp3 exists in R2 and is tracked in Supabase.
 * - Dedupe by sha256(input payload) BEFORE synthesizing.
 * - Store in R2 under tts/sha256/<sha>.mp3
 * - Track in Supabase table tts_assets
 *
 * Returns: { id, sha256, storageKey }
 */
export async function ensureTtsAsset(
    {
        text,
        textType = "text",
        voiceId = "Matthew",
        engine = "standard",
        outputFormat = "mp3",
        languageCode = null,
    },
    supabase,
    trace
) {
    if (!process.env.R2_BUCKET) throw new Error("Missing R2_BUCKET env var");

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

    const storageKey = `tts/sha256/${sha256}.mp3`;

    return scheduleTtsWork(async () => {
        trace?.mark?.("tts_db_lookup_start");
        const existing = await supabase
            .from("tts_assets")
            .select("id")
            .eq("sha256", sha256)
            .maybeSingle();
        trace?.mark?.("tts_db_lookup_end", { hit: Boolean(existing?.data?.id) });

        if (existing?.data?.id) {
            return { id: existing.data.id, sha256, storageKey };
        }

        // Re-check inside scheduler to avoid thundering herd duplication
        trace?.mark?.("tts_db_lookup_2_start");
        const againExisting = await supabase
            .from("tts_assets")
            .select("id")
            .eq("sha256", sha256)
            .maybeSingle();
        trace?.mark?.("tts_db_lookup_2_end", { hit: Boolean(againExisting?.data?.id) });

        if (againExisting?.data?.id) {
            return { id: againExisting.data.id, sha256, storageKey };
        }

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

        // Upload to R2 (idempotent by key)
        trace?.mark?.("tts_r2_put_start");
        await r2.send(
            new PutObjectCommand({
                Bucket: process.env.R2_BUCKET,
                Key: storageKey,
                Body: mp3Buffer,
                ContentType: "audio/mpeg",
                CacheControl: "public, max-age=31536000, immutable",
            })
        );
        trace?.mark?.("tts_r2_put_end");

        trace?.mark?.("tts_r2_head_start");
        const ok = await waitForR2Readable({
            bucket: process.env.R2_BUCKET,
            key: storageKey,
            trace,
        });
        trace?.mark?.("tts_r2_head_end", { ok });

        if (!ok) {
            throw new Error(`R2 object not readable after upload: ${storageKey}`);
        }

        const row = {
            storage_key: storageKey,
            sha256,
            content_type: "audio/mpeg",
            bytes: mp3Buffer.length,
            text: normalizedText,
            text_type: textType,
            voice_id: voiceId,
            engine,
            language_code: languageCode,
        };

        trace?.mark?.("tts_db_insert_start");
        const inserted = await supabase
            .from("tts_assets")
            .insert(row)
            .select("id")
            .maybeSingle();
        trace?.mark?.("tts_db_insert_end");

        if (inserted?.data?.id) {
            return { id: inserted.data.id, sha256, storageKey };
        }

        // Race fallback
        const race = await supabase
            .from("tts_assets")
            .select("id")
            .eq("sha256", sha256)
            .single();

        return { id: race.data.id, sha256, storageKey };
    });
}

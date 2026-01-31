import OpenAI, { toFile } from "openai";

const openai = new OpenAI(); // uses process.env.OPENAI_API_KEY by default

function safeJson(obj) {
    try {
        return JSON.stringify(obj, null, 2);
    } catch {
        return String(obj);
    }
}

function describeOpenAiError(err) {
    // openai sdk errors usually have: status, error, headers, request_id, etc.
    return {
        name: err?.name,
        message: err?.message,
        status: err?.status,
        code: err?.code,
        type: err?.type,
        param: err?.param,
        request_id: err?.request_id,
        headers: err?.headers,
        error: err?.error,
        stack: err?.stack,
    };
}

/**
 * Transcribe short answer audio into text.
 * Expected from browser: audio/webm;codecs=opus or audio/webm.
 */
export async function transcribeAnswerAudio({ buffer, mimeType }) {
    const model = "gpt-4o-mini-transcribe";
    const ct = String(mimeType || "audio/webm");

    if (!Buffer.isBuffer(buffer) || buffer.length === 0) {
        throw new Error("transcribeAnswerAudio: missing/empty buffer");
    }

    // Helpful debug logs (you asked for verbose)
    console.log("[stt] start", {
        model,
        mimeType: ct,
        bytes: buffer.length,
        hasKey: Boolean(process.env.OPENAI_API_KEY),
        keyPrefix: process.env.OPENAI_API_KEY ? process.env.OPENAI_API_KEY.slice(0, 7) : null, // safe-ish
    });

    // IMPORTANT: wrap Buffer as a proper File for multipart
    const file = await toFile(buffer, "answer.webm", { type: ct });

    try {
        const resp = await openai.audio.transcriptions.create({
            model,
            file,
            // optional: language: "en",
        });

        const text = String(resp?.text || "").trim();
        console.log("[stt] ok", { chars: text.length, preview: text.slice(0, 120) });
        return { text };
    } catch (err) {
        const info = describeOpenAiError(err);

        console.error("[stt] failed", safeJson(info));

        // Re-throw with more context so your handler prints something useful too
        throw new Error(
            `STT failed: status=${info.status ?? "?"} message=${info.message ?? "?"} request_id=${info.request_id ?? "?"}`
        );
    }
}

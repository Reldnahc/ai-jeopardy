import OpenAI, { toFile } from "openai";

const openai = new OpenAI();

function safeJson(obj) {
    try {
        return JSON.stringify(obj, null, 2);
    } catch {
        return String(obj);
    }
}

function describeOpenAiError(err) {
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

function buildExpectedAnswerPrompt(context) {
    // You said you'll send ONLY the answer. We'll accept:
    // - context: "Mount Rushmore"
    // - context: ["Mount Rushmore"] (legacy)
    let expected = "";

    if (Array.isArray(context)) expected = String(context[0] ?? "").trim();
    else expected = String(context ?? "").trim();

    if (!expected) return undefined;

    // Keep the prompt short and explicit.
    // This is an STT *bias* hint, not a chat instruction.
    // Also avoid quotes that sometimes get transcribed literally.
    return (
        "English transcription. The spoken response is expected to match this answer closely.\n" +
        "Prefer this exact spelling if heard:\n" +
        expected +
        "\nReturn only the transcript."
    );
}

/**
 * Transcribe short answer audio into text.
 * Expected from browser: audio/webm;codecs=opus or audio/webm.
 */
export async function transcribeAnswerAudio({ buffer, mimeType, context }) {
    const model = "gpt-4o-mini-transcribe";
    const ct = String(mimeType || "audio/webm");

    if (!Buffer.isBuffer(buffer) || buffer.length === 0) {
        throw new Error("transcribeAnswerAudio: missing/empty buffer");
    }

    const prompt = buildExpectedAnswerPrompt(context);

    console.log("[stt] start", {
        model,
        mimeType: ct,
        bytes: buffer.length,
        hasPrompt: Boolean(prompt),
        promptChars: prompt ? prompt.length : 0,
        expectedPreview: Array.isArray(context)
            ? String(context[0] ?? "").slice(0, 80)
            : String(context ?? "").slice(0, 80),
    });

    const file = await toFile(buffer, "answer.webm", { type: ct });

    try {
        const resp = await openai.audio.transcriptions.create({
            model,
            file,
            language: "en",
            prompt, // <-- the whole point
            // Optional debugging:
            // response_format: "json",
            // logprobs: true,
            // temperature: 0,
        });

        const text = String(resp?.text || "").trim();
        console.log("[stt] ok", { chars: text.length, preview: text.slice(0, 120) });
        return { text };
    } catch (err) {
        const info = describeOpenAiError(err);
        console.error("[stt] failed", safeJson(info));
        throw new Error(
            `STT failed: status=${info.status ?? "?"} message=${info.message ?? "?"} request_id=${info.request_id ?? "?"}`
        );
    }
}

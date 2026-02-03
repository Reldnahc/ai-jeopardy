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
    let expected;

    if (Array.isArray(context)) expected = String(context[0] ?? "").trim();
    else expected = String(context ?? "").trim();

    if (!expected) return undefined;

    // Keep the prompt short and explicit.
    // This is an STT *bias* hint, not a chat instruction.
    // Also avoid quotes that sometimes get transcribed literally.
    return (
        "Transcribe speech verbatim.\n" +
        "If you do not clearly hear any speech, return an empty string.\n" +
        "Expected answer hint (may or may not be spoken):\n" +
        expected +
        "\n" +
        "Return only the transcript."
    );
}

/**
 * PASS 1: Language-agnostic probe.
 * Goal: decide if we got *comprehensible* words (any language), not just noise/silence.
 */
function looksComprehensible(text) {
    const t = String(text || "").trim();
    if (!t) return false;

    // Remove whitespace for ratio checks
    const noSpace = t.replace(/\s+/g, "");
    if (noSpace.length < 2) return false;

    // Unicode-aware "letters/numbers" using property escapes.
    // Node 16+ supports this; if you’re on older Node, tell me and I’ll provide a fallback.
    const alphaNum = (t.match(/[\p{L}\p{N}]/gu) || []).length;

    // If it's basically no letters/numbers, it's likely noise/punctuation.
    if (alphaNum === 0) return false;

    // Require at least a tiny amount of “wordy” content.
    // - Either 2+ word chars
    // - Or >= 20% of all non-space chars are letters/numbers
    const ratio = alphaNum / Math.max(1, noSpace.length);

    if (alphaNum >= 2) return true;
    return ratio >= 0.2;
}

async function detectComprehensibleSpeech(file, model) {
    // Intentionally do NOT set `language` and do NOT provide a prompt.
    // This pass should be neutral and language-agnostic.
    const resp = await openai.audio.transcriptions.create({
        model,
        file,
        // language: undefined,
        // prompt: undefined,
    });

    const text = String(resp?.text || "").trim();

    return {
        text,
        hasSpeech: text.length > 0,
        looksComprehensible: looksComprehensible(text),
    };
}

/**
 * PASS 2: Biased transcription with expected answer prompt.
 * (Still using language: "en" because your game answers are expected in English.)
 */
async function transcribeWithExpectedAnswer(file, model, prompt) {
    const resp = await openai.audio.transcriptions.create({
        model,
        file,
        language: "en",
        prompt,
    });

    return String(resp?.text || "").trim();
}

/**
 * Transcribe short answer audio into text.
 * Expected from browser: audio/webm;codecs=opus or audio/webm.
 *
 * Two-pass:
 *  1) Probe (language-agnostic, no prompt) to see if we have comprehensible speech at all
 *  2) If probe looks valid AND we have an expected-answer prompt, run biased pass
 */
export async function transcribeAnswerAudio(buffer, mimeType, context) {
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
        // -------------------------
        // PASS 1: probe (no prompt, any language)
        // -------------------------
        const probe = await detectComprehensibleSpeech(file, model);

        console.log("[stt] probe", {
            hasSpeech: probe.hasSpeech,
            looksComprehensible: probe.looksComprehensible,
            chars: probe.text.length,
            preview: probe.text.slice(0, 120),
        });

        if (!probe.hasSpeech || !probe.looksComprehensible) {
            return "";
        }

        // If no expected-answer hint, the probe is our best neutral result
        if (!prompt) {
            return probe.text;
        }

        // -------------------------
        // PASS 2: biased w/ prompt (English)
        // -------------------------
        const text = await transcribeWithExpectedAnswer(file, model, prompt);

        console.log("[stt] ok", { chars: text.length, preview: text.slice(0, 120) });

        return text;
    } catch (err) {
        const info = describeOpenAiError(err);
        console.error("[stt] failed", safeJson(info));
        throw new Error(
            `STT failed: status=${info.status ?? "?"} message=${info.message ?? "?"} request_id=${info.request_id ?? "?"}`
        );
    }
}

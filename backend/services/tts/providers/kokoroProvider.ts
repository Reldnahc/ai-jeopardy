import type { TtsProvider } from "../types.js";
import { env } from "../../../config/env.js";

function joinUrl(base: string, path: string) {
    const b = base.replace(/\/+$/, "");
    const p = path.replace(/^\/+/, "");
    return `${b}/${p}`;
}

export const kokoroProvider: TtsProvider = {
    name: "kokoro",

    supports(req) {
        // Your kokoro service currently returns WAV.
        // If later you add mp3 support, expand this.
        return req.outputFormat === "wav" || req.outputFormat === "mp3";
    },

    async synthesize(req) {
        const baseUrl = env.KOKORO_URL; // e.g. http://kokoro:8000
        if (!baseUrl) {
            throw new Error("KOKORO_URL not configured");
        }

        const url = joinUrl(baseUrl, "/tts");

        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 30_000);

        try {
            const resp = await fetch(url, {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({
                    text: req.text,
                    voice: req.voiceId, // 👈 Kokoro expects `voice`, not `voiceId`
                }),
                signal: controller.signal,
            });

            if (!resp.ok) {
                const msg = await resp.text().catch(() => "");
                throw new Error(
                    `Kokoro TTS failed: ${resp.status} ${resp.statusText}${msg ? ` - ${msg}` : ""}`.trim()
                );
            }

            const arrayBuf = await resp.arrayBuffer();
            const audioBuffer = Buffer.from(arrayBuf);

            return {
                audioBuffer,
                meta: { voiceId: req.voiceId, outputFormat: req.outputFormat },
            };
        } catch (err) {
            if (err instanceof Error && err.name === "AbortError") {
                throw new Error("Kokoro TTS failed: request timed out");
            }
            throw err;
        } finally {
            clearTimeout(timeout);
        }
    },
};

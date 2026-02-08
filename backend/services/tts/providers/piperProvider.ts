// backend/services/tts/providers/piperProvider.ts
import type { TtsProvider } from "../types.js";

function mustGetEnv(name: string): string {
    const v = process.env[name];
    if (!v) throw new Error(`Missing env var: ${name}`);
    return v;
}

export const piperProvider: TtsProvider = {
    name: "piper",
    supports(req) {
        // up to you; keep strict initially
        return req.outputFormat === "mp3" || req.outputFormat === "wav";
    },
    async synthesize(req) {
        const baseUrl = mustGetEnv("PIPER_URL"); // e.g. http://piper:8000
        const url = `${baseUrl.replace(/\/+$/, "")}/tts`;

        const resp = await fetch(url, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
                text: req.text,
                voiceId: req.voiceId,
                // keep these fields if your API supports them
                outputFormat: req.outputFormat,
                // engine/languageCode optional
                engine: req.engine,
                languageCode: req.languageCode,
            }),
        });

        if (!resp.ok) {
            const msg = await resp.text().catch(() => "");
            throw new Error(`Piper TTS failed: ${resp.status} ${resp.statusText} ${msg}`.trim());
        }

        const arrayBuf = await resp.arrayBuffer();
        const audioBuffer = Buffer.from(arrayBuf);

        return { audioBuffer, meta: { voiceId: req.voiceId, outputFormat: req.outputFormat } };
    },
};

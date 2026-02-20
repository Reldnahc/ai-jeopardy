// backend/services/tts/providers/piperProvider.ts
import type { TtsProvider } from "../types.js";
import { env } from "../../../config/env.js";

function joinUrl(base: string, path: string) {
  const b = base.replace(/\/+$/, "");
  const p = path.replace(/^\/+/, "");
  return `${b}/${p}`;
}

export const piperProvider: TtsProvider = {
  name: "piper",

  supports(req) {
    // Keep strict initially; expand later if your piper service supports more.
    return req.outputFormat === "mp3" || req.outputFormat === "wav";
  },

  async synthesize(req) {
    const baseUrl = env.PIPER_URL; // e.g. http://piper:8000
    const url = joinUrl(baseUrl, "/tts");

    // Avoid hanging forever if piper stalls
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30_000);

    try {
      const resp = await fetch(url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          text: req.text,
          voiceId: req.voiceId,
          outputFormat: req.outputFormat,
          engine: req.engine,
          languageCode: req.languageCode,
        }),
        signal: controller.signal,
      });

      if (!resp.ok) {
        const msg = await resp.text().catch(() => "");
        throw new Error(
          `Piper TTS failed: ${resp.status} ${resp.statusText}${msg ? ` - ${msg}` : ""}`.trim(),
        );
      }

      const arrayBuf = await resp.arrayBuffer();
      const audioBuffer = Buffer.from(arrayBuf);

      return {
        audioBuffer,
        meta: { voiceId: req.voiceId, outputFormat: req.outputFormat },
      };
    } catch (err) {
      // Better message for timeouts
      if (err instanceof Error && err.name === "AbortError") {
        throw new Error("Piper TTS failed: request timed out");
      }
      throw err;
    } finally {
      clearTimeout(timeout);
    }
  },
};

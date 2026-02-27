// backend/services/tts/providers/openaiProvider.ts
import OpenAI from "openai";
import type { TtsProvider } from "../types.js";

const openai = new OpenAI();

function normalizeOpenAiVoice(voiceId: string): { voice: string; speed: number | undefined } {
  const raw = String(voiceId ?? "").trim();
  if (!raw) return { voice: "alloy", speed: undefined };
  const m = raw.match(/^openai:(.+)$/i);
  const payload = String(m?.[1] ?? raw).trim();
  if (!payload) return { voice: "alloy", speed: undefined };

  const speedMatch = payload.match(/^(.+?)@([0-9]*\.?[0-9]+)$/);
  if (!speedMatch) return { voice: payload, speed: undefined };

  const voice = String(speedMatch[1] ?? "").trim() || "alloy";
  const speedRaw = Number(speedMatch[2]);
  if (!Number.isFinite(speedRaw)) return { voice, speed: undefined };
  const speed = Math.min(4, Math.max(0.25, speedRaw));
  return { voice, speed };
}

function normalizeOpenAiModel(engine: string): string {
  const raw = String(engine ?? "").trim();
  return raw && raw !== "default" ? raw : "gpt-4o-mini-tts";
}

export const openaiProvider: TtsProvider = {
  name: "openai",
  supports(req) {
    return (req.outputFormat === "mp3" || req.outputFormat === "wav") && req.textType === "text";
  },
  async synthesize(req) {
    const model = normalizeOpenAiModel(req.engine);
    const { voice, speed } = normalizeOpenAiVoice(req.voiceId);
    const format = req.outputFormat;
    try {
      const resp = await openai.audio.speech.create({
        model,
        voice,
        input: req.text,
        response_format: format,
        speed,
      });
      const arrayBuf = await resp.arrayBuffer();

      return {
        audioBuffer: Buffer.from(arrayBuf),
        meta: { model, voiceId: voice, outputFormat: format },
      };
    } catch (err) {
      const e = err as { status?: number; message?: string; request_id?: string };
      throw new Error(
        `OpenAI TTS failed: status=${e?.status ?? "?"} message=${e?.message ?? "?"} request_id=${e?.request_id ?? "?"}`,
      );
    }
  },
};

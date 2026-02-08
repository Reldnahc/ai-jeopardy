// backend/services/tts/providers/openaiProvider.ts
import type { TtsProvider } from "../types";

export const openaiProvider: TtsProvider = {
    name: "openai",
    supports(req) {
        // Keep strict until you confirm formats/models
        return req.outputFormat === "mp3" || req.outputFormat === "wav";
    },
    async synthesize(req, { trace }) {
        // TODO: Implement using your OpenAI client choice.
        // Return Buffer with audio bytes.
        trace?.mark?.("openai_tts_start");

        throw new Error("openaiProvider.synthesize not implemented yet");
    },
};

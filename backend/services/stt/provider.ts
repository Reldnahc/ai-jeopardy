// backend/stt/provider.ts
import type { SttProvider, SttProviderName } from "./types.js";
import { OpenAiSttProvider } from "./providers/openai.js";
import { WhisperSttProvider } from "./providers/whisper.js";
import {env} from "../../config/env.js"

export function getSttProvider(provider: SttProviderName): SttProvider {
    if (provider === "whisper" && env.WHISPER_URL) {
        return new WhisperSttProvider(env.WHISPER_URL)
    }

    return new OpenAiSttProvider();
}

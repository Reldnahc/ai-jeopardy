// backend/services/tts/providers/registry.ts
import type { TtsProvider, TtsProviderName } from "../types.js";
import { piperProvider } from "./piperProvider.js";
import { openaiProvider } from "./openaiProvider.js";

let _providers: Map<TtsProviderName, TtsProvider> | null = null;

export function getProviders(): Map<TtsProviderName, TtsProvider> {
    if (_providers) return _providers;

    _providers = new Map<TtsProviderName, TtsProvider>([
        [piperProvider.name, piperProvider],
        [openaiProvider.name, openaiProvider],
    ]);

    return _providers;
}

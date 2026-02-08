// backend/services/tts/limiter.ts
import type { TtsProviderName } from "./types";

type Job<T> = {
    fn: () => Promise<T>;
    resolve: (v: T) => void;
    reject: (err: unknown) => void;
};

type Limiter = {
    schedule: <T>(fn: () => Promise<T>) => Promise<T>;
};

function envNum(name: string, fallback: number): number {
    const v = Number(process.env[name]);
    return Number.isFinite(v) ? v : fallback;
}

function makeLimiter(concurrency: number, minDelayMs: number): Limiter {
    let active = 0;
    let lastStart = 0;
    const queue: Array<Job<any>> = [];

    function drain() {
        if (active >= concurrency) return;
        if (queue.length === 0) return;

        const now = Date.now();
        const waitMs = Math.max(0, minDelayMs - (now - lastStart));

        if (waitMs > 0) {
            setTimeout(drain, waitMs);
            return;
        }

        const job = queue.shift()!;
        active++;
        lastStart = Date.now();

        (async () => {
            try {
                const res = await job.fn();
                job.resolve(res);
            } catch (err) {
                job.reject(err);
            } finally {
                active--;
                drain();
            }
        })();
    }

    return {
        schedule<T>(fn: () => Promise<T>): Promise<T> {
            return new Promise<T>((resolve, reject) => {
                queue.push({ fn, resolve, reject });
                drain();
            });
        },
    };
}

// You can tune with env vars:
// TTS_PIPER_CONCURRENCY, TTS_PIPER_MIN_DELAY_MS
// TTS_OPENAI_CONCURRENCY, TTS_OPENAI_MIN_DELAY_MS
const _limiters: Partial<Record<TtsProviderName, Limiter>> = {};

export function getLimiter(provider: TtsProviderName): Limiter {
    if (_limiters[provider]) return _limiters[provider]!;

    if (provider === "piper") {
        _limiters[provider] = makeLimiter(
            envNum("TTS_PIPER_CONCURRENCY", 4),
            envNum("TTS_PIPER_MIN_DELAY_MS", 0)
        );
        return _limiters[provider]!;
    }

    // openai
    _limiters[provider] = makeLimiter(
        envNum("TTS_OPENAI_CONCURRENCY", 2),
        envNum("TTS_OPENAI_MIN_DELAY_MS", 0)
    );
    return _limiters[provider]!;
}

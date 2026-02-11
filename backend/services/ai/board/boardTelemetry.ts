// backend/services/ai/boardTelemetry.ts
export type TraceLike = { mark: (event: string, meta?: Record<string, unknown>) => void };
export type ProgressEvent = { done: number; total: number; progress: number };

export function clamp01(n: number) {
    return Math.max(0, Math.min(1, n));
}

export function makeProgressReporter(onProgress?: (p: ProgressEvent) => void) {
    let total = 0;
    let done = 0;

    const setTotal = (t: number) => {
        total = Math.max(0, t);
    };

    const report = () => {
        const progress = total > 0 ? clamp01(done / total) : 0;
        try {
            onProgress?.({ done, total, progress });
        } catch {
            // ignore
        }
    };

    const tick = (n = 1) => {
        done += n;
        if (done > total) done = total;
        report();
    };

    return {
        setTotal,
        report,
        tick,
        get done() {
            return done;
        },
        get total() {
            return total;
        },
    };
}

export async function timed<T>(trace: TraceLike | undefined, label: string, fn: () => Promise<T>) {
    const start = Date.now();
    trace?.mark(`${label} START`);
    try {
        const out = await fn();
        trace?.mark(`${label} END (+${Date.now() - start}ms)`);
        return out;
    } catch (e) {
        trace?.mark(`${label} FAIL (+${Date.now() - start}ms)`);
        throw e;
    }
}

// backend/services/ai/boardTelemetry.ts
export type ProgressEvent = { done: number; total: number; progress: number };

export function clamp01(n: number) {
    return Math.max(0, Math.min(1, n));
}

export function makeProgressReporter(onProgress?: (p: ProgressEvent) => void) {
    let total = 0;
    let done = 0;

    const report = () => {
        const safeTotal = Math.max(1, total);
        const progress = total > 0 ? clamp01(done / safeTotal) : 0;
        try {
            onProgress?.({ done, total, progress });
        } catch {
            // ignore
        }
    };

    const setTotal = (t: number) => {
        total = Math.max(0, Math.floor(t));
        report();
    };

    const addTotal = (n: number) => {
        total = Math.max(0, total + Math.floor(n));
        report();
    };

    const tick = (n = 1) => {
        done += Math.floor(n);
        if (done < 0) done = 0;
        report();
    };

    const finish = () => {
        // snap to 100% at the end
        done = total;
        report();
    };

    return {
        setTotal,
        addTotal,
        report,
        tick,
        finish,
        get done() {
            return done;
        },
        get total() {
            return total;
        },
    };
}

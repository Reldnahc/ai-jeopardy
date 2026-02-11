import { useEffect, useRef } from "react";
import type {BoardData, Category, Clue} from "../../../shared/types/board.ts";
import { preloadAudioToBlobUrl } from "../../audio/audioCache"; // adjust path

export function preloadAudio(url: string) {
    return new Promise<void>((resolve) => {
        const audio = new Audio();
        audio.preload = "auto";
        audio.src = url;

        const done = () => {
            audio.removeEventListener("canplaythrough", done);
            audio.removeEventListener("loadeddata", done);
            audio.removeEventListener("error", done);
            resolve();
        };

        // canplaythrough is ideal, but not always reliable across browsers
        audio.addEventListener("canplaythrough", done, { once: true });
        audio.addEventListener("loadeddata", done, { once: true });
        audio.addEventListener("error", done, { once: true });

        // Kick it
        audio.load();
    });
}


function getApiBase() {
    // In dev, allow explicit override
    if (import.meta.env.DEV) {
        return import.meta.env.VITE_API_BASE || "http://localhost:3002";
    }

    // In prod, use same-origin
    return "";
}

export function ttsUrl(id: string) {
    return `${getApiBase()}/api/tts/${encodeURIComponent(id).trim()}`;
}

function imageUrl(id: string) {
    return `${getApiBase()}/api/images/${ encodeURIComponent(String(id).trim())}`;
}

function collectImageAssetIds(boardData: BoardData): string[] {
    const allCats: Category[] = [
        ...(boardData.firstBoard?.categories ?? []),
        ...(boardData.secondBoard?.categories ?? []),
        ...(boardData.finalJeopardy?.categories ?? []),
    ];

    const ids = new Set<string>();

    for (const cat of allCats) {
        for (const clue of cat.values ?? []) {
            const media = (clue as Clue).media;
            if (media?.type === "image" && media.assetId?.trim()) {
                ids.add(media.assetId.trim());
            }
        }
    }

    return Array.from(ids);
}

async function preloadOne(url: string, signal: AbortSignal): Promise<void> {
    return new Promise<void>((resolve) => {
        if (signal.aborted) return resolve();

        const img = new Image();

        const cleanup = () => {
            img.onload = null;
            img.onerror = null;
            signal.removeEventListener("abort", onAbort);
        };

        const onAbort = () => {
            cleanup();
            // Stop loading ASAP
            try {
                img.src = "";
            } catch {
                // ignore
            }
            resolve();
        };

        signal.addEventListener("abort", onAbort, { once: true });

        img.onload = async () => {
            cleanup();
            // decode() helps ensure it’s actually decoded & cached when supported
            try {
                if (typeof img.decode === "function") await img.decode();
            } catch {
                // decode can fail even if cached; ignore
            }
            resolve();
        };

        img.onerror = () => {
            cleanup();
            resolve();
        };

        img.src = url;
    });
}

export function usePreload(boardData: BoardData | null | undefined, enabled: boolean) {
    const requestedRef = useRef<Set<string>>(new Set());
    const lastKeyRef = useRef<string>("");

    useEffect(() => {
        if (!enabled || !boardData) return;

        const ids = collectImageAssetIds(boardData);
        if (!ids.length) return;

        // Only rerun when the actual set of asset IDs changes
        const key = ids.slice().sort().join("|");
        if (key === lastKeyRef.current) return;
        lastKeyRef.current = key;

        const controller = new AbortController();
        const { signal } = controller;

        const CONCURRENCY = 5;

        const queue = ids
            .map((id) => imageUrl(id))
            .filter((url) => !requestedRef.current.has(url));

        if (!queue.length) return;

        let inFlight = 0;
        let index = 0;

        const pump = () => {
            if (signal.aborted) return;

            while (inFlight < CONCURRENCY && index < queue.length) {
                const url = queue[index++];
                inFlight++;

                // micro-stagger to avoid bursty connects
                setTimeout(() => {
                    preloadOne(url, signal).finally(() => {
                        requestedRef.current.add(url);
                        inFlight--;
                        pump();
                    });
                }, 50);
            }
        };

        pump();

        return () => {
            controller.abort();
        };
    }, [boardData, enabled]);
}
async function preloadAudioOne(url: string, signal: AbortSignal): Promise<void> {
    const MAX_ATTEMPTS = 7;

    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
        if (signal.aborted) return;

        const blobUrl = await preloadAudioToBlobUrl(url, signal);
        if (blobUrl) return;

        // backoff
        await new Promise((r) => setTimeout(r, Math.min(2500, 200 * Math.pow(1.6, attempt))));
    }

    throw new Error(`preload failed: ${url}`);
}



export function usePreloadAudioAssetIds(
    assetIds: string[] | null | undefined,
    enabled: boolean,
    onDone?: () => void
) {
    const requestedRef = useRef(new Set<string>());
    const pendingRef = useRef<string[]>([]);
    const inFlightRef = useRef(0);
    const runningRef = useRef(false);
    const retryRef = useRef(new Map<string, number>());
    const doneCalledRef = useRef(false);
    const onDoneRef = useRef(onDone);

    useEffect(() => {
        onDoneRef.current = onDone;
    }, [onDone]);

    // Add new ids to pending queue (DO NOT abort old work)
    useEffect(() => {
        if (!enabled) return;

        const next = Array.isArray(assetIds) ? assetIds : [];
        for (const id of next) {
            const url = ttsUrl(String(id).trim());
            if (!url.trim()) continue;
            if (requestedRef.current.has(url)) continue;
            if (pendingRef.current.includes(url)) continue;
            pendingRef.current.push(url);
        }

        // New work => allow onDone again
        doneCalledRef.current = false;

        // Kick worker
        if (!runningRef.current) {
            runningRef.current = true;
            void pump();
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [assetIds, enabled]);

    async function wait(ms: number) {
        await new Promise((r) => setTimeout(r, ms));
    }

    function computeBackoffMs(attempt: number) {
        // 200, 320, 520, 840, 1350... capped
        return Math.min(2500, Math.round(200 * Math.pow(1.6, attempt)));
    }

    async function pump() {
        if (!enabled) {
            runningRef.current = false;
            return;
        }

        const CONCURRENCY = 5;

        while (enabled) {
            while (inFlightRef.current < CONCURRENCY && pendingRef.current.length > 0) {
                const url = pendingRef.current.shift()!;
                inFlightRef.current++;

                void (async () => {
                    try {
                        // Create a per-request controller; we won't abort it on batch updates.
                        const controller = new AbortController();
                        await preloadAudioOne(url, controller.signal);

                        requestedRef.current.add(url);
                        retryRef.current.delete(url);
                    } catch {
                        // Retry later
                        const attempt = retryRef.current.get(url) ?? 0;
                        retryRef.current.set(url, attempt + 1);

                        await wait(computeBackoffMs(attempt) + Math.round(Math.random() * 80));
                        pendingRef.current.push(url);
                    } finally {
                        inFlightRef.current--;
                    }
                })();
            }

            // If nothing pending and nothing in-flight, we’re “done for now”
            if (pendingRef.current.length === 0 && inFlightRef.current === 0) {
                if (!doneCalledRef.current) {
                    doneCalledRef.current = true;
                    onDoneRef.current?.();
                }
                runningRef.current = false;
                return;
            }

            await wait(50);
        }

        runningRef.current = false;
    }

    // If component unmounts, stop pumping new work (don’t cancel in-flight fetches)
    useEffect(() => {
        return () => {
            runningRef.current = false;
        };
    }, []);
}


export function usePreloadImageAssetIds(
    assetIds: string[] | null | undefined,
    enabled: boolean,
    onDone?: () => void
) {
    const requestedRef = useRef(new Set<string>());
    const pendingRef = useRef<string[]>([]);
    const inFlightRef = useRef(0);
    const runningRef = useRef(false);
    const retryRef = useRef(new Map<string, number>());
    const doneCalledRef = useRef(false);
    const onDoneRef = useRef(onDone);

    useEffect(() => {
        onDoneRef.current = onDone;
    }, [onDone]);

    // Add new ids to pending queue (DO NOT abort old work)
    useEffect(() => {
        if (!enabled) return;

        // empty batch should still allow "done" if nothing pending
        const next = Array.isArray(assetIds) ? assetIds : [];
        for (const id of next) {
            const url = imageUrl(id);
            if (!url.trim()) continue;
            if (requestedRef.current.has(url)) continue;
            if (pendingRef.current.includes(url)) continue;
            pendingRef.current.push(url);
        }

        // New work => allow onDone again
        doneCalledRef.current = false;

        // Kick worker
        if (!runningRef.current) {
            runningRef.current = true;
            void pump();
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [assetIds, enabled]);

    async function wait(ms: number) {
        await new Promise((r) => setTimeout(r, ms));
    }

    function computeBackoffMs(attempt: number) {
        // 200, 320, 520, 840, 1350... capped
        return Math.min(2500, Math.round(200 * Math.pow(1.6, attempt)));
    }

    async function imageReadyProbe(url: string) {
        // Use fetch() instead of Image() as a readiness probe.
        // This avoids spammy console errors and lets us treat 202/404 as retry.
        const r = await fetch(url, { cache: "force-cache" });

        if (r.status === 202) return { ready: false as const };
        if (r.status === 404) return { ready: false as const };

        if (!r.ok) throw new Error(`probe failed ${r.status}`);

        const ct = r.headers.get("content-type") || "";
        if (!ct.startsWith("image/")) throw new Error(`probe got non-image (${ct})`);

        // We don’t need full body; but consuming it helps cache in some browsers
        await r.arrayBuffer();
        return { ready: true as const };
    }

    async function pump() {
        if (!enabled) {
            runningRef.current = false;
            return;
        }

        const CONCURRENCY = 5;

        while (enabled) {
            // Start more work if possible
            while (inFlightRef.current < CONCURRENCY && pendingRef.current.length > 0) {
                const url = pendingRef.current.shift()!;
                inFlightRef.current++;

                void (async () => {
                    try {
                        // Probe readiness first (handles “too early”)
                        const probe = await imageReadyProbe(url);
                        if (!probe.ready) {
                            const attempt = retryRef.current.get(url) ?? 0;
                            retryRef.current.set(url, attempt + 1);
                            await wait(computeBackoffMs(attempt) + Math.round(Math.random() * 80));
                            pendingRef.current.push(url);
                            return;
                        }

                        // Now load via Image() so it lands in the image cache
                        await preloadOne(url, new AbortController().signal);
                        requestedRef.current.add(url);
                        retryRef.current.delete(url);
                    } catch {
                        // Retry later
                        const attempt = retryRef.current.get(url) ?? 0;
                        retryRef.current.set(url, attempt + 1);
                        await wait(computeBackoffMs(attempt) + Math.round(Math.random() * 80));
                        pendingRef.current.push(url);
                    } finally {
                        inFlightRef.current--;
                    }
                })();
            }

            // If nothing pending and nothing in-flight, we’re “done for now”
            if (pendingRef.current.length === 0 && inFlightRef.current === 0) {
                if (!doneCalledRef.current) {
                    doneCalledRef.current = true;
                    onDoneRef.current?.();
                }
                runningRef.current = false;
                return;
            }

            // Avoid tight loop
            await wait(50);
        }

        runningRef.current = false;
    }

    // If component unmounts, just stop pumping (don’t abort fetches mid-flight).
    useEffect(() => {
        return () => {
            runningRef.current = false;
        };
    }, []);
}

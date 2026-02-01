import { useEffect, useRef } from "react";
import type { Category, Clue } from "../../types";

type BoardData = {
    firstBoard: { categories: Category[] };
    secondBoard: { categories: Category[] };
    finalJeopardy: { categories: Category[] };
};

function collectImageAssetIds(boardData: BoardData): string[] {
    if (!boardData) return [];

    // Defensive check: handle if boardData is the whole object or just an array
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

    console.log(`[Preloader] Found ${ids.size} unique image IDs.`);
    return Array.from(ids);
}

async function preloadOne(
    url: string,
    signal: AbortSignal,
    onSuccess?: (url: string) => void
): Promise<void> {
    return new Promise<void>((resolve) => {
        if (signal.aborted) return resolve();

        const img = new Image();
        console.log(`[Preloader] Starting download: ${url}`);

        const cleanup = () => {
            img.onload = null;
            img.onerror = null;
        };

        img.onload = async () => {
            cleanup();
            try {
                if (typeof img.decode === "function") {
                    await img.decode();
                    console.log(`[Preloader] Decoded and cached: ${url}`);
                }
            } catch (e) {
                console.warn(`[Preloader] Decode failed for ${url}, but image is cached.` + e);
            }

            onSuccess?.(url);
            resolve();
        };


        img.onerror = () => {
            cleanup();
            console.error(`[Preloader] Failed to load: ${url}`);
            resolve();
        };

        img.src = url;
    });
}

export function usePreloadBoardImages(boardData: BoardData | null | undefined, enabled: boolean) {
    const requestedRef = useRef<Set<string>>(new Set());

    useEffect(() => {
        if (!enabled || !boardData) return;

        const ids = collectImageAssetIds(boardData);
        if (!ids.length) return;

        const controller = new AbortController();
        const { signal } = controller;
        const CONCURRENCY = 2;

        const queue = ids
            .map((id) => `/api/images/${id}`)
            .filter((url) => !requestedRef.current.has(url));

        if (!queue.length) {
            console.log("[Preloader] All found images already requested/cached.");
            return;
        }

        console.log(`[Preloader] Queueing ${queue.length} new images.`);

        let inFlight = 0;
        let index = 0;

        const pump = () => {
            if (signal.aborted) return;

            while (inFlight < CONCURRENCY && index < queue.length) {
                const url = queue[index++];
                inFlight++;

                // micro-stagger to avoid bursty connects
                setTimeout(() => {
                    preloadOne(url, signal, (u) => requestedRef.current.add(u)).finally(() => {
                        inFlight--;
                        pump();
                    });
                }, 75);

            }
        };

        pump();

        return () => {
            console.log("[Preloader] Aborting active preloads (component unmount or data change).");
            controller.abort();
        };
    }, [boardData, enabled]);
}

async function preloadAudioOne(url: string, signal: AbortSignal): Promise<void> {
    const r = await fetch(url, { signal, cache: "force-cache" });

    // If it isn't a 2xx, treat as failure so we can retry later.
    if (!r.ok) {
        throw new Error(`preload failed ${r.status} ${url}`);
    }

    // Optional safety: make sure we didn't download JSON error text
    const ct = r.headers.get("content-type") || "";
    if (!ct.startsWith("audio/")) {
        throw new Error(`preload got non-audio (${ct}) ${url}`);
    }

    // Ensure full download so it actually lands in cache
    await r.arrayBuffer();
}

export function usePreloadAudioAssetIds(
    assetIds: string[] | null | undefined,
    enabled: boolean,
    onDone?: () => void
) {
    const requestedRef = useRef<Set<string>>(new Set());
    const doneCalledRef = useRef(false);

    useEffect(() => {
        if (!enabled) return;
        if (!assetIds || assetIds.length === 0) return;

        const controller = new AbortController();
        const { signal } = controller;

        const CONCURRENCY = 2;

        // Build urls, but DO NOT mark requested yet.
        const queue = assetIds
            .map((id) => `/api/tts/${String(id).trim()}`)
            .filter((url) => !requestedRef.current.has(url));

        if (!queue.length) {
            if (!doneCalledRef.current) {
                doneCalledRef.current = true;
                onDone?.();
            }
            return () => controller.abort();
        }

        let inFlight = 0;
        let index = 0;
        let completed = 0;

        const pump = async () => {
            if (signal.aborted) return;

            while (inFlight < CONCURRENCY && index < queue.length) {
                const url = queue[index++];
                inFlight++;

                // Small stagger to avoid thundering herd against /api/tts in prod
                await new Promise((r) => setTimeout(r, 80));

                preloadAudioOne(url, signal)
                    .then(() => {
                        // Only mark requested if it truly preloaded.
                        requestedRef.current.add(url);
                    })
                    .catch(() => {
                        // swallow — we WANT retries on next render/handshake/etc
                    })
                    .finally(() => {
                        inFlight--;
                        completed++;

                        if (completed >= queue.length && !doneCalledRef.current) {
                            doneCalledRef.current = true;
                            onDone?.();
                        }

                        void pump();
                    });
            }
        };

        void pump();

        return () => controller.abort();
    }, [assetIds, enabled, onDone]);
}

export function usePreloadImageAssetIds(
    assetIds: string[] | null | undefined,
    enabled: boolean,
    onDone?: () => void
) {
    const requestedRef = useRef<Set<string>>(new Set());
    const doneCalledRef = useRef(false);

    useEffect(() => {
        if (!enabled) return;
        if (!assetIds || assetIds.length === 0) return;

        const controller = new AbortController();
        const { signal } = controller;
        const CONCURRENCY = 2;

        const queue = assetIds
            .map((id) => `/api/images/${id}`)
            .filter((url) => !requestedRef.current.has(url));


        if (!queue.length) {
            if (!doneCalledRef.current) {
                doneCalledRef.current = true;
                onDone?.();
            }
            return;
        }

        let inFlight = 0;
        let index = 0;
        let completed = 0;

        const pump = () => {
            if (signal.aborted) return;

            while (inFlight < CONCURRENCY && index < queue.length) {
                const url = queue[index++];
                inFlight++;

                preloadOne(url, signal, (u) => requestedRef.current.add(u)).finally(() => {
                    inFlight--;
                    completed++;

                    if (completed >= queue.length && !doneCalledRef.current) {
                        doneCalledRef.current = true;
                        onDone?.();
                        return;
                    }

                    pump();
                });
            }
        };

        pump();

        return () => controller.abort();
        // IMPORTANT: use assetIds identity carefully; lobby will set once.
    }, [enabled, onDone, assetIds]);
}

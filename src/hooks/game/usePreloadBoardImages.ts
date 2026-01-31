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

async function preloadOne(url: string, signal: AbortSignal): Promise<void> {
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
        const CONCURRENCY = 8;

        const queue = ids
            .map((id) => `/api/images/${id}`)
            .filter((url) => {
                if (requestedRef.current.has(url)) return false;
                requestedRef.current.add(url);
                return true;
            });

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

                // Remove ric/setTimeout to start requests immediately
                preloadOne(url, signal).finally(() => {
                    inFlight--;
                    pump();
                });
            }
        };

        pump();

        return () => {
            console.log("[Preloader] Aborting active preloads (component unmount or data change).");
            controller.abort();
        };
    }, [boardData, enabled]);
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
        const CONCURRENCY = 8;

        const queue = assetIds
            .map((id) => `/api/images/${id}`)
            .filter((url) => {
                if (requestedRef.current.has(url)) return false;
                requestedRef.current.add(url);
                return true;
            });

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

                preloadOne(url, signal).finally(() => {
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

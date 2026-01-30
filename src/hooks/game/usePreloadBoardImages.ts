import { useEffect, useRef } from "react";
import type { Category, Clue } from "../../types";

type BoardData = {
    firstBoard: { categories: Category[] };
    secondBoard: { categories: Category[] };
    finalJeopardy: { categories: Category[] };
};

function collectImageAssetIds(boardData: BoardData | null | undefined): string[] {
    if (!boardData) return [];

    const allCats: Category[] = [
        ...(boardData.firstBoard?.categories ?? []),
        ...(boardData.secondBoard?.categories ?? []),
        ...(boardData.finalJeopardy?.categories ?? []),
    ];

    const ids = new Set<string>();

    for (const cat of allCats) {
        for (const clue of cat.values ?? []) {
            const media = (clue as Clue).media;
            if (media?.type === "image" && typeof media.assetId === "string" && media.assetId.trim()) {
                ids.add(media.assetId);
            }
        }
    }

    return Array.from(ids);
}

async function preloadOne(url: string, signal: AbortSignal): Promise<void> {
    // Prefer Image() so the browser treats it as an image request and warms decode/cache.
    await new Promise<void>((resolve) => {
        if (signal.aborted) return resolve();

        const img = new Image();

        const cleanup = () => {
            img.onload = null;
            img.onerror = null;
        };

        img.onload = async () => {
            cleanup();
            // decode() makes “instant display” more reliable (image can be in cache but not decoded yet)
            // Some browsers may throw; ignore.
            try {
                if (typeof img.decode === "function") await img.decode();
            } catch {
                //ignore
            }
            resolve();
        };

        img.onerror = () => {
            cleanup();
            resolve(); // don’t fail the whole preload pipeline
        };

        img.src = url;
    });
}

/**
 * Preload all clue images from boardData with concurrency limiting + caching.
 * - Does NOT block render.
 * - Avoids re-downloading already requested images.
 */
export function usePreloadBoardImages(boardData: BoardData | null | undefined, enabled: boolean) {
    const requestedRef = useRef<Set<string>>(new Set());

    useEffect(() => {
        if (!enabled) return;

        const ids = collectImageAssetIds(boardData);
        if (!ids.length) return;

        const controller = new AbortController();
        const { signal } = controller;

        // Tune this. 4–8 is usually sane.
        const CONCURRENCY = 6;

        const queue = ids
            .map((id) => `/api/images/${id}`)
            .filter((url) => {
                if (requestedRef.current.has(url)) return false;
                requestedRef.current.add(url);
                return true;
            });

        if (!queue.length) return;

        let inFlight = 0;
        let index = 0;

        const pump = () => {
            if (signal.aborted) return;

            while (inFlight < CONCURRENCY && index < queue.length) {
                const url = queue[index++];
                inFlight++;

                // Schedule off the critical path when possible
                const run = () => {
                    preloadOne(url, signal).finally(() => {
                        inFlight--;
                        pump();
                    });
                };

                // requestIdleCallback helps avoid jank on slower machines.
                // Fallback to setTimeout.
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                const ric = (window as any).requestIdleCallback as undefined | ((cb: () => void) => void);
                if (ric) ric(run);
                else setTimeout(run, 0);
            }
        };

        pump();

        return () => controller.abort();
    }, [boardData, enabled]);
}

import { useEffect, useRef } from "react";
import type { BoardData } from "../../../shared/types/board.ts";
import { preloadAudio, preloadImageElement, preloadAudioUrl, preloadImageUrl } from "./preload.dom.ts";
import {
  buildAssetIdSetKey,
  collectImageAssetIds,
  getUnrequestedUrls,
  imageUrl,
  ttsUrl,
} from "./preload.helpers.ts";
import { usePreloadUrlQueue } from "./usePreloadUrlQueue.ts";

export { preloadAudio, ttsUrl };

export function usePreload(boardData: BoardData | null | undefined, enabled: boolean) {
  const requestedRef = useRef(new Set<string>());
  const lastKeyRef = useRef("");

  useEffect(() => {
    if (!enabled || !boardData) return;

    const assetIds = collectImageAssetIds(boardData);
    if (!assetIds.length) return;

    const assetKey = buildAssetIdSetKey(assetIds);
    if (assetKey === lastKeyRef.current) return;
    lastKeyRef.current = assetKey;

    const controller = new AbortController();
    const signal = controller.signal;
    const queue = getUnrequestedUrls({
      assetIds,
      requestedUrls: requestedRef.current,
      toUrl: imageUrl,
    });

    if (!queue.length) return;

    const concurrency = 10;
    let inFlight = 0;
    let index = 0;

    const pump = () => {
      if (signal.aborted) return;

      while (inFlight < concurrency && index < queue.length) {
        const url = queue[index++];
        inFlight++;

        setTimeout(() => {
          void preloadImageElement(url, signal).finally(() => {
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

export function usePreloadAudioAssetIds(
  assetIds: string[] | null | undefined,
  enabled: boolean,
  onDone?: () => void,
) {
  usePreloadUrlQueue({
    assetIds,
    enabled,
    onDone,
    toUrl: ttsUrl,
    loadUrl: preloadAudioUrl,
  });
}

export function usePreloadImageAssetIds(
  assetIds: string[] | null | undefined,
  enabled: boolean,
  onDone?: () => void,
) {
  usePreloadUrlQueue({
    assetIds,
    enabled,
    onDone,
    toUrl: imageUrl,
    loadUrl: preloadImageUrl,
  });
}

import { useEffect, useRef } from "react";
import { appendPendingUrls, computeBackoffMs } from "./preload.helpers.ts";
import type { QueueLoadResult } from "./preload.dom.ts";

type PreloadQueueOptions = {
  assetIds: string[] | null | undefined;
  enabled: boolean;
  onDone?: () => void;
  toUrl: (id: string) => string;
  loadUrl: (url: string) => Promise<QueueLoadResult>;
};

async function wait(ms: number) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

export function usePreloadUrlQueue({
  assetIds,
  enabled,
  onDone,
  toUrl,
  loadUrl,
}: PreloadQueueOptions) {
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

  async function pump() {
    if (!enabled) {
      runningRef.current = false;
      return;
    }

    const concurrency = 10;

    while (enabled) {
      while (inFlightRef.current < concurrency && pendingRef.current.length > 0) {
        const url = pendingRef.current.shift();
        if (!url) break;

        inFlightRef.current++;

        void (async () => {
          try {
            const result = await loadUrl(url);
            if (result === "retry") {
              const attempt = retryRef.current.get(url) ?? 0;
              retryRef.current.set(url, attempt + 1);
              await wait(computeBackoffMs(attempt) + Math.round(Math.random() * 80));
              pendingRef.current.push(url);
              return;
            }

            requestedRef.current.add(url);
            retryRef.current.delete(url);
          } catch {
            const attempt = retryRef.current.get(url) ?? 0;
            retryRef.current.set(url, attempt + 1);
            await wait(computeBackoffMs(attempt) + Math.round(Math.random() * 80));
            pendingRef.current.push(url);
          } finally {
            inFlightRef.current--;
          }
        })();
      }

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

  useEffect(() => {
    if (!enabled) return;

    pendingRef.current = appendPendingUrls({
      assetIds,
      pendingUrls: pendingRef.current,
      requestedUrls: requestedRef.current,
      toUrl,
    });

    doneCalledRef.current = false;

    if (!runningRef.current) {
      runningRef.current = true;
      void pump();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [assetIds, enabled, toUrl, loadUrl]);

  useEffect(() => {
    return () => {
      runningRef.current = false;
    };
  }, []);
}

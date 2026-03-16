import { preloadAudioToBlobUrl } from "../../audio/audioCache";
import { computeBackoffMs } from "./preload.helpers.ts";

export type QueueLoadResult = "done" | "retry";

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

    audio.addEventListener("canplaythrough", done, { once: true });
    audio.addEventListener("loadeddata", done, { once: true });
    audio.addEventListener("error", done, { once: true });

    audio.load();
  });
}

export async function preloadImageElement(url: string, signal: AbortSignal): Promise<void> {
  return new Promise<void>((resolve) => {
    if (signal.aborted) return resolve();

    const image = new Image();

    const cleanup = () => {
      image.onload = null;
      image.onerror = null;
      signal.removeEventListener("abort", onAbort);
    };

    const onAbort = () => {
      cleanup();
      try {
        image.src = "";
      } catch {
        // ignore abort cleanup failures
      }
      resolve();
    };

    signal.addEventListener("abort", onAbort, { once: true });

    image.onload = async () => {
      cleanup();
      try {
        if (typeof image.decode === "function") {
          await image.decode();
        }
      } catch {
        // decode can fail even when the image is cached
      }
      resolve();
    };

    image.onerror = () => {
      cleanup();
      resolve();
    };

    image.src = url;
  });
}

export async function preloadAudioUrl(url: string): Promise<QueueLoadResult> {
  const controller = new AbortController();
  const signal = controller.signal;
  const maxAttempts = 7;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    if (signal.aborted) return "done";

    const blobUrl = await preloadAudioToBlobUrl(url, signal);
    if (blobUrl) {
      return "done";
    }

    await new Promise((resolve) => setTimeout(resolve, computeBackoffMs(attempt)));
  }

  throw new Error(`preload failed: ${url}`);
}

export async function imageReadyProbe(url: string) {
  const response = await fetch(url, { cache: "force-cache" });

  if (response.status === 202 || response.status === 404) {
    return { ready: false as const };
  }

  if (!response.ok) {
    throw new Error(`probe failed ${response.status}`);
  }

  const contentType = response.headers.get("content-type") || "";
  if (!contentType.startsWith("image/")) {
    throw new Error(`probe got non-image (${contentType})`);
  }

  await response.arrayBuffer();
  return { ready: true as const };
}

export async function preloadImageUrl(url: string): Promise<QueueLoadResult> {
  const probe = await imageReadyProbe(url);
  if (!probe.ready) {
    return "retry";
  }

  await preloadImageElement(url, new AbortController().signal);
  return "done";
}

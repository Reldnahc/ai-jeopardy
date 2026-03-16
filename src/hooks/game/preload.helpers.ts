import type { BoardData } from "../../../shared/types/board.ts";

export function getApiBase() {
  if (import.meta.env.DEV) {
    return import.meta.env.VITE_API_BASE || "http://localhost:3002";
  }

  return "";
}

export function ttsUrl(id: string) {
  return `${getApiBase()}/api/tts/${encodeURIComponent(id).trim()}`;
}

export function imageUrl(id: string) {
  return `${getApiBase()}/api/images/${encodeURIComponent(String(id).trim())}`;
}

export function collectImageAssetIds(boardData: BoardData): string[] {
  const ids = new Set<string>();

  for (const category of [
    ...(boardData.firstBoard?.categories ?? []),
    ...(boardData.secondBoard?.categories ?? []),
    ...(boardData.finalJeopardy?.categories ?? []),
  ]) {
    for (const clue of category.values ?? []) {
      const assetId = clue.media?.type === "image" ? clue.media.assetId?.trim() : "";
      if (assetId) {
        ids.add(assetId);
      }
    }
  }

  return Array.from(ids);
}

export function buildAssetIdSetKey(assetIds: string[]) {
  return assetIds.slice().sort().join("|");
}

export function computeBackoffMs(attempt: number) {
  return Math.min(2500, Math.round(200 * Math.pow(1.6, attempt)));
}

export function appendPendingUrls(args: {
  assetIds: string[] | null | undefined;
  pendingUrls: string[];
  requestedUrls: Set<string>;
  toUrl: (id: string) => string;
}) {
  const nextPending = args.pendingUrls.slice();

  for (const assetId of Array.isArray(args.assetIds) ? args.assetIds : []) {
    const url = args.toUrl(String(assetId).trim());
    if (!url.trim()) continue;
    if (args.requestedUrls.has(url)) continue;
    if (nextPending.includes(url)) continue;
    nextPending.push(url);
  }

  return nextPending;
}

export function getUnrequestedUrls(args: {
  assetIds: string[];
  requestedUrls: Set<string>;
  toUrl: (id: string) => string;
}) {
  return args.assetIds
    .map((assetId) => args.toUrl(assetId))
    .filter((url) => !args.requestedUrls.has(url));
}

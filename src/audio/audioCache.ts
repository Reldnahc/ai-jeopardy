const blobUrlByHttpUrl = new Map<string, string>();

export function getCachedAudioBlobUrl(httpUrl: string): string | null {
    return blobUrlByHttpUrl.get(httpUrl) ?? null;
}

export async function preloadAudioToBlobUrl(
    httpUrl: string,
    signal?: AbortSignal
): Promise<string | null> {
    const hit = blobUrlByHttpUrl.get(httpUrl);
    if (hit) return hit;

    try {
        const r = await fetch(httpUrl, {
            signal,
            cache: "force-cache",
            // credentials: "include", // only if you require cookies/auth
        });

        if (!r.ok) return null;

        const ct = r.headers.get("content-type") || "audio/wav";
        const buf = await r.arrayBuffer(); // ✅ forces FULL download

        const blobUrl = URL.createObjectURL(new Blob([buf], { type: ct }));
        blobUrlByHttpUrl.set(httpUrl, blobUrl);
        return blobUrl;
    } catch {
        return null;
    }
}

// Optional: call this on app teardown if you want to reclaim memory
export function clearAudioBlobCache() {
    for (const u of blobUrlByHttpUrl.values()) URL.revokeObjectURL(u);
    blobUrlByHttpUrl.clear();
}

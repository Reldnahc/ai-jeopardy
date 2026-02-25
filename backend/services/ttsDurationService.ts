import { estimateMp3DurationMsFromHeaderBytes } from "./mp3Duration.js";
import { estimateWavDurationMsFromHeaderBytes } from "./wavDuration.js";

type TtsBinaryRow = {
  data?: Buffer | Uint8Array | null;
  bytes?: number | null;
  content_type?: string | null;
};

type TtsDurationRepos = {
  tts?: {
    getBinaryById(assetId: string): Promise<TtsBinaryRow | null>;
  };
};

export function createTtsDurationService(repos: TtsDurationRepos) {
  if (!repos?.tts) throw new Error("createTtsDurationService: missing repos.tts");

  const cache = new Map<string, number>();

  async function getDurationMs(assetId: string | null | undefined): Promise<number | null> {
    if (!assetId) return null;
    if (cache.has(assetId)) return cache.get(assetId);

    const row = await repos.tts.getBinaryById(assetId);
    if (!row?.data) return null;

    const contentType = row.content_type || "";
    const headerBytes = row.data.subarray(0, 8192);

    let ms = null;

    if (contentType === "audio/wav") {
      // WAV estimation can trim trailing PCM silence when full bytes are available.
      ms = estimateWavDurationMsFromHeaderBytes(row.data);
    } else if (contentType === "audio/mpeg") {
      ms = estimateMp3DurationMsFromHeaderBytes(headerBytes, Number(row.bytes || row.data.length));
    }

    if (ms != null) cache.set(assetId, ms);
    return ms ?? null;
  }

  return { getDurationMs };
}

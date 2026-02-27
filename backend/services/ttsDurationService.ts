import { estimateMp3DurationMsFromBytes } from "./mp3Duration.js";
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

    const contentType = String(row.content_type || "").toLowerCase();
    const bytes = row.data;
    const totalBytes = Number(row.bytes || row.data.length);

    const isWavByHeader =
      bytes.length >= 12 &&
      bytes.toString("ascii", 0, 4) === "RIFF" &&
      bytes.toString("ascii", 8, 12) === "WAVE";

    const isMp3ByHeader =
      (bytes.length >= 3 && bytes.toString("ascii", 0, 3) === "ID3") ||
      (bytes.length >= 2 && bytes[0] === 0xff && (bytes[1] & 0xe0) === 0xe0);

    let ms = null;

    // Prefer byte-signature over DB metadata to avoid legacy/mislabeled rows.
    if (isWavByHeader || contentType === "audio/wav") {
      // WAV estimation can trim trailing PCM silence when full bytes are available.
      ms = estimateWavDurationMsFromHeaderBytes(bytes);
      if (ms == null && isMp3ByHeader) {
        // metadata says wav but bytes look mp3 (or wav parse failed): fallback.
        ms = estimateMp3DurationMsFromBytes(bytes, totalBytes);
      }
    } else if (isMp3ByHeader || contentType === "audio/mpeg") {
      ms = estimateMp3DurationMsFromBytes(bytes, totalBytes);
      if (ms == null && isWavByHeader) {
        // metadata says mp3 but bytes look wav: fallback.
        ms = estimateWavDurationMsFromHeaderBytes(bytes);
      }
    }

    if (ms != null) cache.set(assetId, ms);
    return ms ?? null;
  }

  return { getDurationMs };
}

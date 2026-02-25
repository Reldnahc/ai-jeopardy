// backend/services/wavDuration.js

const MAX_TRAILING_SILENCE_TRIM_MS = 700;
const PCM16_SILENCE_THRESHOLD = 8;

type ParsedWav = {
  audioFormat: number;
  sampleRate: number;
  channels: number;
  bitsPerSample: number;
  dataSize: number;
  dataOffset: number;
};

function parseWav(bytes: Buffer): ParsedWav | null {
  if (bytes.length < 44) return null;

  // "RIFF"
  if (
    bytes[0] !== 0x52 || // R
    bytes[1] !== 0x49 || // I
    bytes[2] !== 0x46 || // F
    bytes[3] !== 0x46 // F
  )
    return null;

  // "WAVE"
  if (
    bytes[8] !== 0x57 || // W
    bytes[9] !== 0x41 || // A
    bytes[10] !== 0x56 || // V
    bytes[11] !== 0x45 // E
  )
    return null;

  let offset = 12;
  let audioFormat: number | null = null;
  let sampleRate: number | null = null;
  let channels: number | null = null;
  let bitsPerSample: number | null = null;
  let dataSize: number | null = null;
  let dataOffset: number | null = null;

  while (offset + 8 <= bytes.length) {
    const chunkId = bytes.toString("ascii", offset, offset + 4);
    const chunkSize = bytes.readUInt32LE(offset + 4);
    const chunkDataStart = offset + 8;

    if (chunkId === "fmt ") {
      if (chunkDataStart + 16 > bytes.length || chunkSize < 16) return null;

      audioFormat = bytes.readUInt16LE(chunkDataStart);
      channels = bytes.readUInt16LE(chunkDataStart + 2);
      sampleRate = bytes.readUInt32LE(chunkDataStart + 4);
      bitsPerSample = bytes.readUInt16LE(chunkDataStart + 14);
    } else if (chunkId === "data") {
      dataSize = chunkSize;
      dataOffset = chunkDataStart;
      break;
    }

    // RIFF chunks are word-aligned.
    offset = chunkDataStart + chunkSize + (chunkSize % 2);
  }

  if (
    !audioFormat ||
    !sampleRate ||
    !channels ||
    !bitsPerSample ||
    dataSize == null ||
    !dataOffset
  ) {
    return null;
  }

  return { audioFormat, sampleRate, channels, bitsPerSample, dataSize, dataOffset };
}

function trimTrailingSilencePcm16(bytes: Buffer, wav: ParsedWav): number {
  if (wav.audioFormat !== 1 || wav.bitsPerSample !== 16) return wav.dataSize;
  if (wav.dataOffset + wav.dataSize > bytes.length) return wav.dataSize;

  const bytesPerSample = wav.bitsPerSample / 8;
  const frameBytes = wav.channels * bytesPerSample;
  if (!frameBytes) return wav.dataSize;

  const totalFrames = Math.floor(wav.dataSize / frameBytes);
  if (!totalFrames) return wav.dataSize;

  const maxTrimFrames = Math.floor((wav.sampleRate * MAX_TRAILING_SILENCE_TRIM_MS) / 1000);
  const minFrame = Math.max(0, totalFrames - maxTrimFrames);

  let trailingSilentFrames = 0;
  for (let frame = totalFrames - 1; frame >= minFrame; frame -= 1) {
    const frameStart = wav.dataOffset + frame * frameBytes;

    let silent = true;
    for (let ch = 0; ch < wav.channels; ch += 1) {
      const sample = bytes.readInt16LE(frameStart + ch * bytesPerSample);
      if (Math.abs(sample) > PCM16_SILENCE_THRESHOLD) {
        silent = false;
        break;
      }
    }

    if (!silent) break;
    trailingSilentFrames += 1;
  }

  return Math.max(0, wav.dataSize - trailingSilentFrames * frameBytes);
}

export function estimateWavDurationMsFromHeaderBytes(
  headerBytes: Buffer | Uint8Array | null | undefined,
): number | null {
  if (!headerBytes || headerBytes.length < 44) return null;
  const bytes = Buffer.isBuffer(headerBytes) ? headerBytes : Buffer.from(headerBytes);
  const wav = parseWav(bytes);
  if (!wav) return null;

  const bytesPerSecond = wav.sampleRate * wav.channels * (wav.bitsPerSample / 8);
  if (!bytesPerSecond) return null;

  const trimmedDataSize = trimTrailingSilencePcm16(bytes, wav);
  const durationMs = Math.round((trimmedDataSize / bytesPerSecond) * 1000);

  if (!Number.isFinite(durationMs) || durationMs < 0) return null;
  return Math.min(durationMs, 60_000);
}

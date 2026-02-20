// backend/services/wavDuration.js

export function estimateWavDurationMsFromHeaderBytes(headerBytes) {
  if (!headerBytes || headerBytes.length < 44) return null;

  // "RIFF"
  if (
    headerBytes[0] !== 0x52 || // R
    headerBytes[1] !== 0x49 || // I
    headerBytes[2] !== 0x46 || // F
    headerBytes[3] !== 0x46 // F
  )
    return null;

  // "WAVE"
  if (
    headerBytes[8] !== 0x57 || // W
    headerBytes[9] !== 0x41 || // A
    headerBytes[10] !== 0x56 || // V
    headerBytes[11] !== 0x45 // E
  )
    return null;

  let offset = 12;

  let sampleRate = null;
  let channels = null;
  let bitsPerSample = null;
  let dataSize = null;

  // Walk chunks until we find "fmt " and "data"
  while (offset + 8 <= headerBytes.length) {
    const chunkId = headerBytes.toString("ascii", offset, offset + 4);
    const chunkSize = headerBytes.readUInt32LE(offset + 4);
    offset += 8;

    if (chunkId === "fmt ") {
      if (chunkSize < 16) return null;

      const audioFormat = headerBytes.readUInt16LE(offset);
      if (audioFormat !== 1) return null; // PCM only (fine for Piper)

      channels = headerBytes.readUInt16LE(offset + 2);
      sampleRate = headerBytes.readUInt32LE(offset + 4);
      bitsPerSample = headerBytes.readUInt16LE(offset + 14);
    } else if (chunkId === "data") {
      dataSize = chunkSize;
      break;
    }

    offset += chunkSize;
  }

  if (!sampleRate || !channels || !bitsPerSample || !dataSize) {
    return null;
  }

  const bytesPerSecond = sampleRate * channels * (bitsPerSample / 8);
  if (!bytesPerSecond) return null;

  const durationMs = Math.round((dataSize / bytesPerSecond) * 1000);

  if (!Number.isFinite(durationMs) || durationMs < 0) return null;

  // Clamp defensively (same idea as MP3)
  return Math.min(durationMs, 60_000);
}

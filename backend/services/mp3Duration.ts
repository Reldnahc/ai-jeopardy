// MP3 frame header parsing. We compute duration by walking frames and summing
// samples/sample-rate, which is substantially more accurate than single-header
// bitrate estimates (especially for VBR files).

function readSynchsafeInt(b0: number, b1: number, b2: number, b3: number): number {
  // ID3 uses 7 bits per byte
  return ((b0 & 0x7f) << 21) | ((b1 & 0x7f) << 14) | ((b2 & 0x7f) << 7) | (b3 & 0x7f);
}

function skipId3(buf: Uint8Array): number {
  if (buf.length < 10) return 0;
  if (buf[0] !== 0x49 || buf[1] !== 0x44 || buf[2] !== 0x33) return 0; // "ID3"
  const size = readSynchsafeInt(buf[6], buf[7], buf[8], buf[9]);
  return 10 + size;
}

function findFirstFrameHeader(buf: Uint8Array, start: number): number {
  for (let i = start; i + 4 <= buf.length; i++) {
    // sync: 11 bits set => 0xFF followed by 0xE0 mask
    if (buf[i] === 0xff && (buf[i + 1] & 0xe0) === 0xe0) return i;
  }
  return -1;
}

// Tables from MPEG spec
const BITRATE_KBPS = {
  // key: `${version}:${layer}` where version: 1 | 2 (covers 2 and 2.5), layer: 3|2|1
  "1:3": [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320, 0], // MPEG1 Layer III
  "1:2": [0, 32, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320, 384, 0], // MPEG1 Layer II
  "1:1": [0, 32, 64, 96, 128, 160, 192, 224, 256, 288, 320, 352, 384, 416, 448, 0], // MPEG1 Layer I
  "2:3": [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160, 0], // MPEG2/2.5 Layer III
  "2:2": [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160, 0], // MPEG2/2.5 Layer II
  "2:1": [0, 32, 48, 56, 64, 80, 96, 112, 128, 144, 160, 176, 192, 224, 256, 0], // MPEG2/2.5 Layer I
};

const SAMPLE_RATES: Record<number, number[]> = {
  0: [11025, 12000, 8000], // MPEG 2.5
  2: [22050, 24000, 16000], // MPEG 2
  3: [44100, 48000, 32000], // MPEG 1
};

type ParsedHeader = {
  versionId: number;
  layer: 1 | 2 | 3;
  bitrateBps: number;
  sampleRate: number;
  padding: number;
  samplesPerFrame: number;
  frameLength: number;
};

function parseFrameHeader(buf: Uint8Array, pos: number): ParsedHeader | null {
  if (pos + 4 > buf.length) return null;
  if (buf[pos] !== 0xff || (buf[pos + 1] & 0xe0) !== 0xe0) return null;

  const b1 = buf[pos + 1];
  const b2 = buf[pos + 2];

  const versionId = (b1 >> 3) & 0x03;
  if (versionId === 0x01) return null; // reserved

  const layerId = (b1 >> 1) & 0x03;
  let layer: 1 | 2 | 3;
  if (layerId === 0x01) layer = 3;
  else if (layerId === 0x02) layer = 2;
  else if (layerId === 0x03) layer = 1;
  else return null;

  const bitrateIndex = (b2 >> 4) & 0x0f;
  const sampleRateIndex = (b2 >> 2) & 0x03;
  const padding = (b2 >> 1) & 0x01;
  if (sampleRateIndex === 0x03) return null;

  const versionKey = versionId === 0x03 ? 1 : 2; // MPEG1 vs MPEG2/2.5
  const table = BITRATE_KBPS[`${versionKey}:${layer}`];
  if (!table) return null;

  const kbps = table[bitrateIndex] || 0;
  if (!kbps) return null;
  const bitrateBps = kbps * 1000;

  const rates = SAMPLE_RATES[versionId];
  if (!rates) return null;
  const sampleRate = rates[sampleRateIndex];
  if (!sampleRate) return null;

  let samplesPerFrame: number;
  let frameLength: number;
  if (layer === 1) {
    samplesPerFrame = 384;
    frameLength = Math.floor((12 * bitrateBps) / sampleRate + padding) * 4;
  } else {
    samplesPerFrame = layer === 3 && versionId !== 0x03 ? 576 : 1152;
    const slotFactor = layer === 3 && versionId !== 0x03 ? 72 : 144;
    frameLength = Math.floor((slotFactor * bitrateBps) / sampleRate + padding);
  }

  if (!Number.isFinite(frameLength) || frameLength <= 0) return null;

  return {
    versionId,
    layer,
    bitrateBps,
    sampleRate,
    padding,
    samplesPerFrame,
    frameLength,
  };
}

export function estimateMp3DurationMsFromBytes(
  bytes: Uint8Array | null | undefined,
  totalBytes?: number,
): number | null {
  if (!bytes || bytes.length < 16) return null;
  const len = Number.isFinite(totalBytes) && Number(totalBytes) > 0 ? Number(totalBytes) : bytes.length;
  if (len <= 0) return null;

  let pos = findFirstFrameHeader(bytes, skipId3(bytes));
  if (pos < 0) return null;

  let durationMs = 0;
  let frames = 0;

  while (pos + 4 <= len) {
    const h = parseFrameHeader(bytes, pos);
    if (!h) {
      // Try to resync by scanning forward.
      const next = findFirstFrameHeader(bytes, pos + 1);
      if (next < 0 || next <= pos) break;
      pos = next;
      continue;
    }

    if (pos + h.frameLength > len) break;

    durationMs += (h.samplesPerFrame * 1000) / h.sampleRate;
    frames += 1;
    pos += h.frameLength;
  }

  if (!frames) return null;
  const out = Math.round(durationMs);
  if (!Number.isFinite(out) || out < 0) return null;
  return Math.min(out, 60_000);
}

export function estimateMp3DurationMsFromHeaderBytes(
  headerBytes: Uint8Array | null | undefined,
  totalBytes: number,
): number | null {
  // Back-compat wrapper. Prefer estimateMp3DurationMsFromBytes with full data.
  return estimateMp3DurationMsFromBytes(headerBytes, totalBytes);
}

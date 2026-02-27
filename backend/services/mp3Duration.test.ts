import { describe, expect, it } from "vitest";
import { estimateMp3DurationMsFromBytes } from "./mp3Duration.js";

function makeMpeg1Layer3Frame({
  bitrateIndex,
  sampleRateIndex,
  padding = 0,
}: {
  bitrateIndex: number;
  sampleRateIndex: number;
  padding?: 0 | 1;
}) {
  // MPEG1 Layer III, no CRC
  const b0 = 0xff;
  const b1 = 0xfb; // 11111011
  const b2 = ((bitrateIndex & 0x0f) << 4) | ((sampleRateIndex & 0x03) << 2) | ((padding & 0x01) << 1);
  const b3 = 0x00;

  const bitrateKbpsTable = [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320, 0];
  const sampleRateTable = [44100, 48000, 32000];
  const bitrateBps = bitrateKbpsTable[bitrateIndex] * 1000;
  const sampleRate = sampleRateTable[sampleRateIndex];
  const frameLen = Math.floor((144 * bitrateBps) / sampleRate + padding);

  const frame = new Uint8Array(frameLen);
  frame[0] = b0;
  frame[1] = b1;
  frame[2] = b2;
  frame[3] = b3;
  return frame;
}

describe("mp3Duration", () => {
  it("returns null for invalid data", () => {
    expect(estimateMp3DurationMsFromBytes(new Uint8Array([1, 2, 3]))).toBeNull();
  });

  it("estimates duration by walking MPEG frames", () => {
    // 40 frames of MPEG1 L3 @ 128kbps/44.1kHz.
    const frames = Array.from({ length: 40 }, () =>
      makeMpeg1Layer3Frame({ bitrateIndex: 9, sampleRateIndex: 0 }),
    );
    const total = frames.reduce((n, f) => n + f.length, 0);
    const bytes = new Uint8Array(total);
    let off = 0;
    for (const f of frames) {
      bytes.set(f, off);
      off += f.length;
    }

    const ms = estimateMp3DurationMsFromBytes(bytes);
    // 40 * 1152 / 44100 = 1.0449s
    expect(ms).not.toBeNull();
    expect(ms!).toBeGreaterThanOrEqual(1040);
    expect(ms!).toBeLessThanOrEqual(1050);
  });

  it("skips ID3v2 tag before first frame", () => {
    const id3 = new Uint8Array(10);
    id3[0] = 0x49; // I
    id3[1] = 0x44; // D
    id3[2] = 0x33; // 3
    // synchsafe size=0 (10-byte header only)
    const frame = makeMpeg1Layer3Frame({ bitrateIndex: 9, sampleRateIndex: 0 });
    const bytes = new Uint8Array(id3.length + frame.length);
    bytes.set(id3, 0);
    bytes.set(frame, id3.length);

    const ms = estimateMp3DurationMsFromBytes(bytes);
    expect(ms).not.toBeNull();
    expect(ms!).toBeGreaterThan(20);
    expect(ms!).toBeLessThan(30);
  });
});


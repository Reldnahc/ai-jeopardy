import { describe, expect, it } from "vitest";
import { estimateWavDurationMsFromHeaderBytes } from "./wavDuration.js";

function makeMonoPcm16Wav(sampleRate: number, toneMs: number, silenceTailMs: number): Buffer {
  const toneSamples = Math.floor((sampleRate * toneMs) / 1000);
  const silenceSamples = Math.floor((sampleRate * silenceTailMs) / 1000);
  const totalSamples = toneSamples + silenceSamples;

  const dataSize = totalSamples * 2; // mono, 16-bit
  const fileSize = 44 + dataSize;
  const out = Buffer.alloc(fileSize);

  out.write("RIFF", 0, "ascii");
  out.writeUInt32LE(fileSize - 8, 4);
  out.write("WAVE", 8, "ascii");
  out.write("fmt ", 12, "ascii");
  out.writeUInt32LE(16, 16); // PCM fmt chunk size
  out.writeUInt16LE(1, 20); // PCM
  out.writeUInt16LE(1, 22); // channels
  out.writeUInt32LE(sampleRate, 24);
  out.writeUInt32LE(sampleRate * 2, 28); // byte rate
  out.writeUInt16LE(2, 32); // block align
  out.writeUInt16LE(16, 34); // bits
  out.write("data", 36, "ascii");
  out.writeUInt32LE(dataSize, 40);

  for (let i = 0; i < totalSamples; i += 1) {
    const isTone = i < toneSamples;
    const sample = isTone ? 1000 : 0;
    out.writeInt16LE(sample, 44 + i * 2);
  }

  return out;
}

describe("wavDuration", () => {
  it("trims trailing PCM silence from full wav bytes", () => {
    const wav = makeMonoPcm16Wav(16_000, 1000, 350);
    const ms = estimateWavDurationMsFromHeaderBytes(wav);

    expect(ms).not.toBeNull();
    expect(ms as number).toBeGreaterThanOrEqual(990);
    expect(ms as number).toBeLessThanOrEqual(1010);
  });

  it("still parses short header-only buffers without trimming", () => {
    const wav = makeMonoPcm16Wav(16_000, 1000, 350);
    const headerOnly = wav.subarray(0, 64);
    const ms = estimateWavDurationMsFromHeaderBytes(headerOnly);

    expect(ms).toBe(1350);
  });
});

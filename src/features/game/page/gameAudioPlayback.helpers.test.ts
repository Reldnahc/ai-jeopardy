import { describe, expect, it, vi } from "vitest";
import {
  AUDIO_LAST_NONZERO_KEY,
  AUDIO_VOLUME_KEY,
  buildTtsUrl,
  computeAiHostOffsetMs,
  getMicPermissionFromError,
  getStoredAudioVolume,
  normalizeMicPermissionState,
  parseAiHostAsset,
  persistAudioVolume,
  resolveGameApiBase,
  shouldShowAutoplayReminder,
} from "./gameAudioPlayback.helpers.ts";

describe("gameAudioPlayback helpers", () => {
  it("resolves the dev API base with a localhost fallback", () => {
    expect(resolveGameApiBase({ DEV: true, VITE_API_BASE: "https://api.example" })).toBe(
      "https://api.example",
    );
    expect(resolveGameApiBase({ DEV: true })).toBe("http://localhost:3002");
    expect(resolveGameApiBase({ DEV: false, VITE_API_BASE: "https://api.example" })).toBe("");
  });

  it("builds the encoded TTS URL", () => {
    expect(buildTtsUrl("clip/1", "https://api.example")).toBe(
      "https://api.example/api/tts/clip%2F1",
    );
  });

  it("loads and clamps stored audio volume", () => {
    const storage = {
      getItem: vi.fn(() => "2"),
    };

    expect(getStoredAudioVolume(storage)).toBe(1);
    expect(getStoredAudioVolume({ getItem: vi.fn(() => "-1") })).toBe(0);
    expect(getStoredAudioVolume({ getItem: vi.fn(() => "bad") })).toBe(1);
  });

  it("persists current and last non-zero audio volume", () => {
    const storage = {
      setItem: vi.fn(),
    };

    persistAudioVolume(storage, 0.4);

    expect(storage.setItem).toHaveBeenCalledWith(AUDIO_VOLUME_KEY, "0.4");
    expect(storage.setItem).toHaveBeenCalledWith(AUDIO_LAST_NONZERO_KEY, "0.4");
  });

  it("skips last non-zero persistence when the volume is muted", () => {
    const storage = {
      setItem: vi.fn(),
    };

    persistAudioVolume(storage, 0);

    expect(storage.setItem).toHaveBeenCalledTimes(1);
    expect(storage.setItem).toHaveBeenCalledWith(AUDIO_VOLUME_KEY, "0");
  });

  it("parses ai-host asset payloads and computes offsets from start or receive time", () => {
    const parsed = parseAiHostAsset("tts::asset-1::1200::300::1500");

    expect(parsed).toEqual({
      assetId: "asset-1",
      startedAtMs: 1200,
      baseOffsetMs: 300,
      receivedAtMs: 1500,
    });
    expect(
      computeAiHostOffsetMs({
        asset: parsed,
        nowMs: () => 1700,
      }),
    ).toBe(500);
    expect(
      computeAiHostOffsetMs({
        asset: { ...parsed, startedAtMs: 0 },
        nowMs: () => 0,
        receivedNowMs: 1800,
      }),
    ).toBe(600);
  });

  it("normalizes microphone permission states and errors", () => {
    expect(normalizeMicPermissionState("granted")).toBe("granted");
    expect(normalizeMicPermissionState("prompt")).toBe("prompt");
    expect(normalizeMicPermissionState("denied")).toBe("denied");
    expect(getMicPermissionFromError(new DOMException("blocked", "NotAllowedError"))).toBe(
      "denied",
    );
    expect(getMicPermissionFromError(new Error("unknown"))).toBe("prompt");
  });

  it("flags autoplay reminders only when narration wants audio but playback is blocked", () => {
    expect(
      shouldShowAutoplayReminder({
        narrationEnabled: true,
        audioMuted: false,
        isAudioReady: true,
        audioBlockedByPolicy: true,
        audioContextState: "running",
      }),
    ).toBe(true);

    expect(
      shouldShowAutoplayReminder({
        narrationEnabled: true,
        audioMuted: false,
        isAudioReady: true,
        audioBlockedByPolicy: false,
        audioContextState: "running",
      }),
    ).toBe(false);
  });
});

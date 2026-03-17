export const AUDIO_VOLUME_KEY = "aj_audioVolume";
export const AUDIO_LAST_NONZERO_KEY = "aj_audioLastNonZeroVolume";

export type MicPermissionState = "granted" | "prompt" | "denied" | "unknown";

export type ParsedAiHostAsset = {
  assetId: string;
  startedAtMs: number;
  baseOffsetMs: number;
  receivedAtMs: number;
};

export function resolveGameApiBase(env: { DEV?: boolean; VITE_API_BASE?: string }): string {
  if (env.DEV) return env.VITE_API_BASE || "http://localhost:3002";
  return "";
}

export function buildTtsUrl(assetId: string, apiBase: string): string {
  return `${apiBase}/api/tts/${encodeURIComponent(assetId)}`;
}

export function getStoredAudioVolume(
  storage: Pick<Storage, "getItem"> | null | undefined,
  fallback: number = 1,
): number {
  if (!storage) return fallback;

  try {
    const raw = storage.getItem(AUDIO_VOLUME_KEY);
    const value = raw == null ? fallback : Number(raw);
    if (!Number.isFinite(value)) return fallback;
    return Math.min(1, Math.max(0, value));
  } catch {
    return fallback;
  }
}

export function persistAudioVolume(
  storage: Pick<Storage, "setItem"> | null | undefined,
  audioVolume: number,
): void {
  if (!storage) return;

  try {
    storage.setItem(AUDIO_VOLUME_KEY, String(audioVolume));
    if (audioVolume > 0) {
      storage.setItem(AUDIO_LAST_NONZERO_KEY, String(audioVolume));
    }
  } catch {
    // ignore storage failures
  }
}

export function parseAiHostAsset(aiHostAsset: string): ParsedAiHostAsset {
  const parts = aiHostAsset.split("::");
  return {
    assetId: String(parts[1] ?? aiHostAsset).trim(),
    startedAtMs: Math.max(0, Number(parts[2] ?? 0) || 0),
    baseOffsetMs: Math.max(0, Number(parts[3] ?? 0) || 0),
    receivedAtMs: Math.max(0, Number(parts[4] ?? 0) || 0),
  };
}

export function computeAiHostOffsetMs(args: {
  asset: ParsedAiHostAsset;
  nowMs: () => number;
  receivedNowMs?: number;
}): number {
  const { asset, nowMs, receivedNowMs = Date.now() } = args;

  if (asset.startedAtMs > 0) {
    return Math.max(asset.baseOffsetMs, Math.round(nowMs() - asset.startedAtMs));
  }

  if (asset.receivedAtMs > 0) {
    return Math.max(
      asset.baseOffsetMs,
      Math.round(asset.baseOffsetMs + (receivedNowMs - asset.receivedAtMs)),
    );
  }

  return asset.baseOffsetMs;
}

export function normalizeMicPermissionState(state: PermissionState): MicPermissionState {
  if (state === "granted" || state === "prompt" || state === "denied") return state;
  return "unknown";
}

export function getMicPermissionFromError(error: unknown): MicPermissionState {
  const name = error instanceof DOMException ? error.name : "";
  if (name === "NotAllowedError" || name === "SecurityError") return "denied";
  return "prompt";
}

export function shouldShowAutoplayReminder(args: {
  narrationEnabled: boolean;
  audioMuted: boolean;
  isAudioReady: boolean;
  audioBlockedByPolicy: boolean;
  audioContextState: AudioContextState;
}): boolean {
  return Boolean(
    args.narrationEnabled &&
      !args.audioMuted &&
      args.isAudioReady &&
      (args.audioBlockedByPolicy || args.audioContextState !== "running"),
  );
}

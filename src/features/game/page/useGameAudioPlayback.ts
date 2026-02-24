import { useCallback, useEffect, useRef, useState } from "react";
import { getCachedAudioBlobUrl } from "../../../audio/audioCache.ts";

function getApiBase() {
  if (import.meta.env.DEV) return import.meta.env.VITE_API_BASE || "http://localhost:3002";
  return "";
}

function ttsUrl(id: string) {
  return `${getApiBase()}/api/tts/${encodeURIComponent(id)}`;
}

type UseGameAudioPlaybackArgs = {
  aiHostAsset: string | null;
  narrationEnabled: boolean;
  nowMs: () => number;
};

export function useGameAudioPlayback({
  aiHostAsset,
  narrationEnabled,
  nowMs,
}: UseGameAudioPlaybackArgs) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const gainNodeRef = useRef<GainNode | null>(null);
  const compressorRef = useRef<DynamicsCompressorNode | null>(null);
  const lastAiHostAssetPlayedRef = useRef<string | null>(null);

  const [isAudioReady, setIsAudioReady] = useState(false);
  const [audioUnlockTick, setAudioUnlockTick] = useState(0);
  const [audioBlockedByPolicy, setAudioBlockedByPolicy] = useState(false);
  const [audioContextState, setAudioContextState] = useState<AudioContextState>("suspended");
  const [micPermission, setMicPermission] = useState<"granted" | "prompt" | "denied" | "unknown">(
    "unknown",
  );

  const AUDIO_VOLUME_KEY = "aj_audioVolume";
  const AUDIO_LAST_NONZERO_KEY = "aj_audioLastNonZeroVolume";

  const [audioVolume, setAudioVolume] = useState<number>(() => {
    try {
      const raw = localStorage.getItem(AUDIO_VOLUME_KEY);
      const v = raw == null ? 1 : Number(raw);
      if (!Number.isFinite(v)) return 1;
      return Math.min(1, Math.max(0, v));
    } catch {
      return 1;
    }
  });

  const audioMuted = audioVolume <= 0;

  useEffect(() => {
    try {
      localStorage.setItem(AUDIO_VOLUME_KEY, String(audioVolume));
      if (audioVolume > 0) localStorage.setItem(AUDIO_LAST_NONZERO_KEY, String(audioVolume));
    } catch {
      // ignore
    }
  }, [audioVolume]);

  const playAudioUrl = useCallback(
    async (httpUrl: string, offsetMs: number = 0): Promise<boolean> => {
      const a = audioRef.current;
      if (!a) return false;

      try {
        a.pause();
        a.muted = false;
        const gain = gainNodeRef.current;
        if (gain) gain.gain.value = audioVolume;

        const blobUrl = getCachedAudioBlobUrl(httpUrl);
        a.src = blobUrl || httpUrl;

        const seekSec = Math.max(0, offsetMs / 1000);
        const seekToOffset = () => {
          try {
            a.currentTime = seekSec;
          } catch {
            // ignore seek errors; playback will start at 0
          }
        };

        if (seekSec > 0) {
          if (a.readyState >= 1) seekToOffset();
          else a.addEventListener("loadedmetadata", seekToOffset, { once: true });
        } else {
          a.currentTime = 0;
        }

        if (audioVolume <= 0) return false;
        await a.play();
        setAudioBlockedByPolicy(false);
        return true;
      } catch (e) {
        console.debug("TTS play blocked:", e);
        setAudioBlockedByPolicy(true);
        return false;
      }
    },
    [audioVolume],
  );

  useEffect(() => {
    if (!aiHostAsset) return;
    if (lastAiHostAssetPlayedRef.current === aiHostAsset) return;
    if (!isAudioReady || !narrationEnabled || audioMuted) return;

    const parts = aiHostAsset.split("::");
    const assetId = String(parts[1] ?? aiHostAsset).trim();
    const startedAtMs = Math.max(0, Number(parts[2] ?? 0) || 0);
    const baseOffsetMs = Math.max(0, Number(parts[3] ?? 0) || 0);
    const receivedAtMs = Math.max(0, Number(parts[4] ?? 0) || 0);
    if (!assetId) return;

    const computedOffsetMs = (() => {
      if (startedAtMs > 0) return Math.max(baseOffsetMs, Math.round(nowMs() - startedAtMs));
      if (receivedAtMs > 0)
        return Math.max(baseOffsetMs, Math.round(baseOffsetMs + (Date.now() - receivedAtMs)));
      return baseOffsetMs;
    })();

    let cancelled = false;
    void playAudioUrl(ttsUrl(assetId), computedOffsetMs).then((played) => {
      if (cancelled) return;
      if (played) lastAiHostAssetPlayedRef.current = aiHostAsset;
    });

    return () => {
      cancelled = true;
    };
  }, [aiHostAsset, narrationEnabled, audioMuted, isAudioReady, audioUnlockTick, nowMs, playAudioUrl]);

  useEffect(() => {
    const audio = new Audio();
    audio.preload = "auto";
    audio.crossOrigin = "anonymous";

    const ctx = new AudioContext();
    const source = ctx.createMediaElementSource(audio);
    const gain = ctx.createGain();
    const compressor = ctx.createDynamicsCompressor();

    compressor.threshold.value = -18;
    compressor.knee.value = 12;
    compressor.ratio.value = 3;
    compressor.attack.value = 0.003;
    compressor.release.value = 0.25;

    source.connect(gain);
    gain.connect(compressor);
    compressor.connect(ctx.destination);

    audioRef.current = audio;
    audioCtxRef.current = ctx;
    gainNodeRef.current = gain;
    compressorRef.current = compressor;
    setAudioContextState(ctx.state);
    ctx.onstatechange = () => setAudioContextState(ctx.state);
    setIsAudioReady(true);

    return () => {
      audio.pause();
      audio.src = "";
      source.disconnect();
      gain.disconnect();
      compressor.disconnect();
      void ctx.close();
      ctx.onstatechange = null;
      audioRef.current = null;
      audioCtxRef.current = null;
      gainNodeRef.current = null;
      compressorRef.current = null;
      setIsAudioReady(false);
      setAudioContextState("closed");
    };
  }, []);

  useEffect(() => {
    const gain = gainNodeRef.current;
    if (gain) gain.gain.value = audioVolume;
  }, [audioVolume]);

  useEffect(() => {
    const unlockAudio = () => {
      const ctx = audioCtxRef.current;
      if (ctx && ctx.state !== "running") void ctx.resume().catch(() => {});
      setAudioUnlockTick((v) => v + 1);
    };

    window.addEventListener("pointerdown", unlockAudio, { passive: true });
    window.addEventListener("keydown", unlockAudio);
    window.addEventListener("touchstart", unlockAudio, { passive: true });
    return () => {
      window.removeEventListener("pointerdown", unlockAudio);
      window.removeEventListener("keydown", unlockAudio);
      window.removeEventListener("touchstart", unlockAudio);
    };
  }, []);

  useEffect(() => {
    let mounted = true;
    let status: PermissionStatus | null = null;

    const mapState = (state: PermissionState) => {
      if (state === "granted" || state === "prompt" || state === "denied") return state;
      return "unknown";
    };

    if (!("permissions" in navigator) || !navigator.permissions?.query) {
      setMicPermission("unknown");
      return;
    }

    void navigator.permissions
      .query({ name: "microphone" as PermissionName })
      .then((s) => {
        if (!mounted) return;
        status = s;
        setMicPermission(mapState(s.state));
        s.onchange = () => {
          if (!mounted) return;
          setMicPermission(mapState(s.state));
        };
      })
      .catch(() => {
        if (mounted) setMicPermission("unknown");
      });

    return () => {
      mounted = false;
      if (status) status.onchange = null;
    };
  }, []);

  const requestMicPermission = useCallback(async () => {
    if (!navigator.mediaDevices?.getUserMedia) {
      setMicPermission("unknown");
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach((track) => track.stop());
      setMicPermission("granted");
    } catch (e) {
      const name = e instanceof DOMException ? e.name : "";
      if (name === "NotAllowedError" || name === "SecurityError") setMicPermission("denied");
      else setMicPermission("prompt");
    }
  }, []);

  const showAutoplayReminder = Boolean(
    narrationEnabled &&
      !audioMuted &&
      isAudioReady &&
      (audioBlockedByPolicy || audioContextState !== "running"),
  );

  return {
    audioVolume,
    setAudioVolume,
    micPermission,
    requestMicPermission,
    showAutoplayReminder,
  };
}

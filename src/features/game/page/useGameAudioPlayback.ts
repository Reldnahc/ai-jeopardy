import { useCallback, useEffect, useRef, useState } from "react";
import { getCachedAudioBlobUrl } from "../../../audio/audioCache.ts";
import {
  buildTtsUrl,
  computeAiHostOffsetMs,
  getMicPermissionFromError,
  getStoredAudioVolume,
  normalizeMicPermissionState,
  parseAiHostAsset,
  persistAudioVolume,
  resolveGameApiBase,
  shouldShowAutoplayReminder,
  type MicPermissionState,
} from "./gameAudioPlayback.helpers.ts";

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
  const apiBase = resolveGameApiBase(import.meta.env);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const gainNodeRef = useRef<GainNode | null>(null);
  const compressorRef = useRef<DynamicsCompressorNode | null>(null);
  const lastAiHostAssetPlayedRef = useRef<string | null>(null);

  const [isAudioReady, setIsAudioReady] = useState(false);
  const [audioUnlockTick, setAudioUnlockTick] = useState(0);
  const [audioBlockedByPolicy, setAudioBlockedByPolicy] = useState(false);
  const [audioContextState, setAudioContextState] = useState<AudioContextState>("suspended");
  const [micPermission, setMicPermission] = useState<MicPermissionState>("unknown");

  const [audioVolume, setAudioVolume] = useState<number>(() => getStoredAudioVolume(localStorage));

  const audioMuted = audioVolume <= 0;

  useEffect(() => {
    persistAudioVolume(localStorage, audioVolume);
  }, [audioVolume]);

  const playAudioUrl = useCallback(
    async (httpUrl: string, offsetMs: number = 0): Promise<boolean> => {
      const a = audioRef.current;
      if (!a) return false;

      const tryPlay = async (src: string) => {
        a.src = src;
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
        return true;
      };

      try {
        a.pause();
        a.muted = false;
        const gain = gainNodeRef.current;
        if (gain) gain.gain.value = audioVolume;

        const blobUrl = getCachedAudioBlobUrl(httpUrl);
        if (blobUrl) {
          try {
            await tryPlay(blobUrl);
          } catch {
            // Blob URL can occasionally be stale/invalid; retry direct endpoint.
            await tryPlay(httpUrl);
          }
        } else {
          await tryPlay(httpUrl);
        }
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

    const parsedAsset = parseAiHostAsset(aiHostAsset);
    if (!parsedAsset.assetId) return;

    const computedOffsetMs = computeAiHostOffsetMs({
      asset: parsedAsset,
      nowMs,
    });

    let cancelled = false;
    void playAudioUrl(buildTtsUrl(parsedAsset.assetId, apiBase), computedOffsetMs).then((played) => {
      if (cancelled) return;
      if (played) lastAiHostAssetPlayedRef.current = aiHostAsset;
    });

    return () => {
      cancelled = true;
    };
  }, [
    aiHostAsset,
    apiBase,
    narrationEnabled,
    audioMuted,
    isAudioReady,
    audioUnlockTick,
    nowMs,
    playAudioUrl,
  ]);

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

    if (!("permissions" in navigator) || !navigator.permissions?.query) {
      setMicPermission("unknown");
      return;
    }

    void navigator.permissions
      .query({ name: "microphone" as PermissionName })
      .then((s) => {
        if (!mounted) return;
        status = s;
        setMicPermission(normalizeMicPermissionState(s.state));
        s.onchange = () => {
          if (!mounted) return;
          setMicPermission(normalizeMicPermissionState(s.state));
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
      setMicPermission(getMicPermissionFromError(e));
    }
  }, []);

  const showAutoplayReminder = shouldShowAutoplayReminder({
    narrationEnabled,
    audioMuted,
    isAudioReady,
    audioBlockedByPolicy,
    audioContextState,
  });

  return {
    audioVolume,
    setAudioVolume,
    micPermission,
    requestMicPermission,
    showAutoplayReminder,
  };
}

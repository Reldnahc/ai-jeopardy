import { useEffect, useRef, useState } from "react";

type VadMeta = {
  hasSpoken: boolean;
  maxRms: number;
  voiceMs: number;
  durationMs: number;
};

type CaptureResult = {
  blob: Blob;
  mimeType: string;
  vad: VadMeta;
};

type NoSpeechResult = {
  mimeType: string;
  vad: VadMeta;
};

type UseVadAudioCaptureOptions = {
  enabled: boolean;
  sessionId: string | null;
  durationMs?: number | null;
  onCaptureComplete: (result: CaptureResult) => void | Promise<void>;
  onNoSpeech?: (result: NoSpeechResult) => void | Promise<void>;
  onError?: (err: unknown) => void;
};

function pickMimeType(): string {
  const preferred = "audio/webm;codecs=opus";
  if (typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(preferred))
    return preferred;
  if (typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported("audio/webm"))
    return "audio/webm";
  return "";
}

function createAudioContext(): AudioContext {
  const ctor =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!ctor) throw new Error("AudioContext not supported");
  return new ctor();
}

export function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error);
    reader.onloadend = () => {
      const result = String(reader.result || "");
      const base64 = result.split(",")[1] || "";
      resolve(base64);
    };
    reader.readAsDataURL(blob);
  });
}

export function useVadAudioCapture({
  enabled,
  sessionId,
  durationMs,
  onCaptureComplete,
  onNoSpeech,
  onError,
}: UseVadAudioCaptureOptions) {
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);
  const completedSessionRef = useRef<string | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const onCaptureCompleteRef = useRef(onCaptureComplete);
  const onNoSpeechRef = useRef(onNoSpeech);
  const onErrorRef = useRef(onError);

  useEffect(() => {
    onCaptureCompleteRef.current = onCaptureComplete;
    onNoSpeechRef.current = onNoSpeech;
    onErrorRef.current = onError;
  }, [onCaptureComplete, onError, onNoSpeech]);

  useEffect(() => {
    if (!enabled || !sessionId) return;
    if (completedSessionRef.current === sessionId) return;

    let cancelled = false;

    const start = async () => {
      let stream: MediaStream | null = null;
      let audioCtx: AudioContext | null = null;
      let analyser: AnalyserNode | null = null;
      let source: MediaStreamAudioSourceNode | null = null;
      let vadTimer: number | null = null;

      const cleanupResources = async () => {
        if (vadTimer) {
          window.clearTimeout(vadTimer);
          vadTimer = null;
        }

        try {
          source?.disconnect();
        } catch {
          // ignore
        }
        try {
          analyser?.disconnect();
        } catch {
          // ignore
        }
        try {
          await audioCtx?.close();
        } catch {
          // ignore
        }
        try {
          stream?.getTracks().forEach((t) => t.stop());
        } catch {
          // ignore
        }
      };

      try {
        stream = await navigator.mediaDevices.getUserMedia({
          audio: {
            channelCount: 1,
            sampleRate: 16000,
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
          },
        });

        const mime = pickMimeType();

        chunksRef.current = [];
        const rec = new MediaRecorder(
          stream,
          mime
            ? { mimeType: mime, audioBitsPerSecond: 24000, bitsPerSecond: 24000 }
            : { audioBitsPerSecond: 24000, bitsPerSecond: 24000 },
        );

        recorderRef.current = rec;

        const END_SILENCE_MS = 900;
        const VAD_INTERVAL_MS = 80;
        const RMS_THRESHOLD = 0.018;

        audioCtx = createAudioContext();
        source = audioCtx.createMediaStreamSource(stream);
        analyser = audioCtx.createAnalyser();
        analyser.fftSize = 2048;
        source.connect(analyser);

        const data = new Float32Array(analyser.fftSize);
        let hasSpoken = false;
        let lastVoiceAt = 0;
        let maxRms = 0;
        let voiceTicks = 0;
        const startedAt = Date.now();

        const computeRms = () => {
          if (!analyser) return 0;
          analyser.getFloatTimeDomainData(data);
          let sum = 0;
          for (let i = 0; i < data.length; i++) sum += data[i] * data[i];
          return Math.sqrt(sum / data.length);
        };

        const scheduleVadTick = () => {
          if (cancelled || !recorderRef.current) return;

          const level = computeRms();
          if (level > maxRms) maxRms = level;
          if (level > RMS_THRESHOLD) voiceTicks += 1;

          const now = Date.now();
          if (level > RMS_THRESHOLD) {
            hasSpoken = true;
            lastVoiceAt = now;
          }

          if (hasSpoken && now - lastVoiceAt >= END_SILENCE_MS) {
            try {
              if (rec.state !== "inactive") rec.stop();
            } catch {
              // ignore
            }
            return;
          }

          vadTimer = window.setTimeout(scheduleVadTick, VAD_INTERVAL_MS);
        };

        rec.ondataavailable = (e) => {
          if (e.data && e.data.size > 0) chunksRef.current.push(e.data);
        };

        rec.onstop = async () => {
          setIsRecording(false);
          await cleanupResources();

          if (cancelled) return;

          const durationMsTotal = Date.now() - startedAt;
          const vad = {
            hasSpoken,
            maxRms,
            voiceMs: voiceTicks * VAD_INTERVAL_MS,
            durationMs: durationMsTotal,
          };
          const mimeType = rec.mimeType || "audio/webm";

          completedSessionRef.current = sessionId;

          if (!hasSpoken) {
            await onNoSpeechRef.current?.({ mimeType, vad });
            return;
          }

          const blob = new Blob(chunksRef.current, { type: mimeType });
          chunksRef.current = [];

          await onCaptureCompleteRef.current({ blob, mimeType: blob.type, vad });
        };

        rec.start(1000);
        setIsRecording(true);
        vadTimer = window.setTimeout(scheduleVadTick, VAD_INTERVAL_MS);

        const BUFFER_MS = 800;
        const hardStopInMs = Math.max(500, (durationMs || 6500) - BUFFER_MS);
        window.setTimeout(() => {
          try {
            if (rec.state !== "inactive") rec.stop();
          } catch {
            // ignore
          }
        }, hardStopInMs);
      } catch (err) {
        setIsRecording(false);
        onErrorRef.current?.(err);
        await cleanupResources();
      }
    };

    void start();

    return () => {
      cancelled = true;

      try {
        const rec = recorderRef.current;
        if (rec && rec.state !== "inactive") rec.stop();
      } catch {
        // ignore
      }

      setIsRecording(false);
      recorderRef.current = null;
      chunksRef.current = [];
    };
  }, [durationMs, enabled, sessionId]);

  return { isRecording };
}

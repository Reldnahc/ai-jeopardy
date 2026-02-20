// hooks/useEarlyMicPermission.ts
import { useEffect } from "react";

export function useEarlyMicPermission() {
  useEffect(() => {
    let cancelled = false;

    const request = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });

        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }

        // Immediately stop — permission is now granted
        stream.getTracks().forEach((t) => t.stop());
      } catch (err) {
        // IMPORTANT: swallow errors
        // User might deny — that’s okay, game still works
        console.warn("Microphone permission not granted:", err);
      }
    };

    request();

    return () => {
      cancelled = true;
    };
  }, []);
}

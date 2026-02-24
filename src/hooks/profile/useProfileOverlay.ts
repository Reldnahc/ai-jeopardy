import { useRef } from "react";

export function useProfileOverlay<T extends object>() {
  const pendingOverlayRef = useRef<Partial<T>>({});
  const pendingSinceRef = useRef<number>(0);

  const applyOverlay = (profile: T | null): T | null => {
    if (!profile) return profile;
    const overlay = pendingOverlayRef.current;
    if (!overlay || Object.keys(overlay).length === 0) return profile;
    return { ...profile, ...overlay };
  };

  const addOverlay = (patch: Partial<T>) => {
    pendingOverlayRef.current = { ...pendingOverlayRef.current, ...patch };
    pendingSinceRef.current = Date.now();
  };

  const clearOverlay = () => {
    pendingOverlayRef.current = {};
  };

  const maybeClearOverlayIfServerMatches = (serverProfile: T, patch: Partial<T>) => {
    const next = { ...pendingOverlayRef.current };
    let changed = false;

    for (const k of Object.keys(patch) as Array<keyof T>) {
      if ((serverProfile as T)[k] === patch[k]) {
        delete next[k];
        changed = true;
      }
    }

    if (changed) pendingOverlayRef.current = next;
  };

  return {
    pendingOverlayRef,
    pendingSinceRef,
    applyOverlay,
    addOverlay,
    clearOverlay,
    maybeClearOverlayIfServerMatches,
  };
}

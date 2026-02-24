import { useEffect, useRef, useState } from "react";
import type { Profile as P } from "../../contexts/ProfileContext";
import { normalizeUsername, toErrorMessage } from "./profilePageController.shared";

interface UseRouteProfileLoaderArgs {
  usernameParam: string | undefined;
  fetchPublicProfile: (username: string) => Promise<P | null>;
  applyOverlay: (profile: P | null) => P | null;
}

export function useRouteProfileLoader({
  usernameParam,
  fetchPublicProfile,
  applyOverlay,
}: UseRouteProfileLoaderArgs) {
  const [routeProfile, setRouteProfile] = useState<P | null>(null);
  const [routeLoading, setRouteLoading] = useState(true);
  const [routeError, setRouteError] = useState<string | null>(null);
  const [routeGaveUp, setRouteGaveUp] = useState(false);
  const [retryTick, setRetryTick] = useState(0);

  const fetchSeq = useRef(0);
  const fetchPublicProfileRef = useRef(fetchPublicProfile);

  useEffect(() => {
    fetchPublicProfileRef.current = fetchPublicProfile;
  }, [fetchPublicProfile]);

  useEffect(() => {
    const u = normalizeUsername(usernameParam);
    if (!u) return;

    const mySeq = ++fetchSeq.current;
    let cancelled = false;

    setRouteGaveUp(false);
    setRouteError(null);

    const attemptOnce = async (): Promise<boolean> => {
      setRouteLoading(true);

      try {
        const p = await fetchPublicProfileRef.current(u);

        if (cancelled || mySeq !== fetchSeq.current) return false;

        if (!p) {
          setRouteError("Profile not found (yet). Retrying...");
          return false;
        }

        setRouteProfile(applyOverlay(p));
        setRouteError(null);
        return true;
      } catch (e: unknown) {
        if (cancelled || mySeq !== fetchSeq.current) return false;
        setRouteError(toErrorMessage(e));
        return false;
      } finally {
        if (!cancelled && mySeq === fetchSeq.current) setRouteLoading(false);
      }
    };

    void (async () => {
      let ok = await attemptOnce();

      if (!ok && !routeProfile) {
        for (let i = 0; i < 9; i++) {
          if (cancelled || mySeq !== fetchSeq.current) return;
          await new Promise((r) => setTimeout(r, 300));
          ok = await attemptOnce();
          if (ok) break;
        }
      }

      if (!ok && !cancelled && mySeq === fetchSeq.current && !routeProfile) setRouteGaveUp(true);
    })();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [usernameParam, retryTick]);

  return {
    routeProfile,
    setRouteProfile,
    routeLoading,
    routeError,
    setRouteError,
    routeGaveUp,
    retry: () => {
      setRouteGaveUp(false);
      setRetryTick((n) => n + 1);
    },
  };
}

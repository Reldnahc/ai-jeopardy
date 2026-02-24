import { useEffect, useRef, useState } from "react";
import type { LeaderboardRow } from "../../../backend/repositories/profile/profile.types.ts";
import { fetchJson, getApiBase } from "../../utils/utils.ts";
import { MAX_ROWS, PAGE_SIZE, type StatKey } from "./leaderboardStats.ts";

export function useLeaderboardRows(stat: StatKey) {
  const [rows, setRows] = useState<LeaderboardRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadMoreRef = useRef<HTMLDivElement | null>(null);
  const requestGenRef = useRef(0);
  const abortRef = useRef<AbortController | null>(null);
  const loadingRef = useRef(false);
  const hasMoreRef = useRef(true);
  const rowsLenRef = useRef(0);

  useEffect(() => {
    loadingRef.current = loading;
  }, [loading]);

  useEffect(() => {
    hasMoreRef.current = hasMore;
  }, [hasMore]);

  useEffect(() => {
    rowsLenRef.current = rows.length;
  }, [rows.length]);

  const fetchRows = async (offset: number, limit: number, signal?: AbortSignal) => {
    const genAtCall = requestGenRef.current;

    if (rowsLenRef.current >= MAX_ROWS) {
      setHasMore(false);
      return;
    }

    if (loadingRef.current || !hasMoreRef.current) return;

    loadingRef.current = true;
    setLoading(true);
    setError(null);

    try {
      const api = getApiBase();
      const params = new URLSearchParams();
      params.set("stat", stat);
      params.set("offset", String(offset));
      params.set("limit", String(limit));

      const data = await fetchJson<{ rows: LeaderboardRow[] }>(
        `${api}/api/leaderboard?${params.toString()}`,
        { signal },
      );

      if (requestGenRef.current !== genAtCall) return;

      const incoming = (data?.rows ?? []).map((r) => ({
        ...r,
        value: Number(r.value ?? 0),
        username: String(r.username ?? "")
          .trim()
          .toLowerCase(),
        displayname: String(r.displayname ?? r.username ?? "").trim(),
      }));

      setRows((prev) => {
        const merged = [...prev, ...incoming];
        return merged.slice(0, MAX_ROWS);
      });

      if (incoming.length < limit || offset + incoming.length >= MAX_ROWS) {
        setHasMore(false);
      }
    } catch (e: unknown) {
      if (e instanceof DOMException && e.name === "AbortError") return;
      if (e instanceof Error && e.message.toLowerCase().includes("aborted")) return;
      if (requestGenRef.current !== genAtCall) return;

      setError(e instanceof Error ? e.message : String(e));
      setHasMore(false);
    } finally {
      if (requestGenRef.current === genAtCall) {
        loadingRef.current = false;
        setLoading(false);
      }
    }
  };

  useEffect(() => {
    requestGenRef.current += 1;

    abortRef.current?.abort();
    const ac = new AbortController();
    abortRef.current = ac;

    rowsLenRef.current = 0;
    hasMoreRef.current = true;
    loadingRef.current = false;

    setRows([]);
    setHasMore(true);
    setError(null);
    setLoading(false);

    void fetchRows(0, Math.min(PAGE_SIZE, MAX_ROWS), ac.signal);

    return () => ac.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stat]);

  useEffect(() => {
    if (rows.length === 0) return;

    const el = loadMoreRef.current;
    if (!el) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const first = entries[0];
        if (!first?.isIntersecting) return;
        if (!hasMoreRef.current || loadingRef.current) return;

        const remaining = MAX_ROWS - rowsLenRef.current;
        if (remaining <= 0) {
          setHasMore(false);
          return;
        }

        const ac = abortRef.current;
        void fetchRows(rowsLenRef.current, Math.min(PAGE_SIZE, remaining), ac?.signal);
      },
      { threshold: 1.0 },
    );

    observer.observe(el);
    return () => observer.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows.length]);

  return {
    rows,
    loading,
    hasMore,
    error,
    loadMoreRef,
  };
}

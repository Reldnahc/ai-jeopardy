// frontend/pages/Leaderboard.tsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import Avatar from "../components/common/Avatar";
import { getProfilePresentation } from "../utils/profilePresentation";
import type { Profile } from "../contexts/ProfileContext";
import { LeaderboardRow } from "../../backend/repositories/profile/profile.types.ts";
import { ProfileIconName } from "../components/common/profileIcons.tsx";
import { getApiBase, fetchJson } from "../utils/utils.ts";

type StatKey =
  | "money_won"
  | "games_won"
  | "games_finished"
  | "correct_answers"
  | "true_daily_doubles"
  | "times_buzzed"
  | "final_jeopardy_corrects"
  | "daily_double_found"
  | "daily_double_correct"
  | "clues_selected";

const STAT_OPTIONS: Array<{
  key: StatKey;
  label: string;
  format: (n: number) => string;
}> = [
  { key: "money_won", label: "Money Won", format: (n) => `$${Math.trunc(n).toLocaleString()}` },
  { key: "games_won", label: "Games Won", format: (n) => Math.trunc(n).toLocaleString() },
  { key: "games_finished", label: "Games Finished", format: (n) => Math.trunc(n).toLocaleString() },
  {
    key: "correct_answers",
    label: "Correct Answers",
    format: (n) => Math.trunc(n).toLocaleString(),
  },
  {
    key: "true_daily_doubles",
    label: "True Daily Doubles",
    format: (n) => Math.trunc(n).toLocaleString(),
  },

  // rename times_buzzed for UI
  { key: "times_buzzed", label: "Buzzer Wins", format: (n) => Math.trunc(n).toLocaleString() },

  {
    key: "final_jeopardy_corrects",
    label: "Final Jeopardy Correct",
    format: (n) => Math.trunc(n).toLocaleString(),
  },
  {
    key: "daily_double_found",
    label: "Daily Doubles Found",
    format: (n) => Math.trunc(n).toLocaleString(),
  },
  {
    key: "daily_double_correct",
    label: "Daily Doubles Correct",
    format: (n) => Math.trunc(n).toLocaleString(),
  },
  { key: "clues_selected", label: "Clues Selected", format: (n) => Math.trunc(n).toLocaleString() },
];

function toLeaderboardProfile(r: LeaderboardRow): Profile {
  const u = String(r.username ?? "")
    .trim()
    .toLowerCase();
  const display = String(r.displayname ?? u).trim();

  return {
    id: `leaderboard:${u}`,
    username: u,
    displayname: display,

    color: r.color ?? "#3b82f6",
    text_color: r.text_color ?? "#ffffff",
    name_color: r.name_color ?? "#111827",
    border: r.border ?? "",
    font: r.font ?? null,
    icon: (r.icon as ProfileIconName) ?? null,

    role: r.role,
    email: null,
    tokens: null,

    created_at: undefined,
    updated_at: undefined,
  };
}

const MAX_ROWS = 100;
const PAGE_SIZE = 25;

const Leaderboard: React.FC = () => {
  const [stat, setStat] = useState<StatKey>("money_won");

  const [rows, setRows] = useState<LeaderboardRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadMoreRef = useRef<HTMLDivElement | null>(null);

  // --- race-proof refs ------------------------------------------------
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

  const selectedStat = useMemo(() => {
    return STAT_OPTIONS.find((s) => s.key === stat) ?? STAT_OPTIONS[0];
  }, [stat]);

  const fetchRows = async (offset: number, limit: number, signal?: AbortSignal) => {
    const genAtCall = requestGenRef.current;

    // hard stop
    if (rowsLenRef.current >= MAX_ROWS) {
      setHasMore(false);
      return;
    }

    // Important: use refs (not closure state) so we don't "every other time" skip
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

      // If stat changed mid-flight, ignore results
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
      // Abort isn't a "real" error; don't poison hasMore
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

  // Stat change: abort previous, reset, then load first page
  useEffect(() => {
    requestGenRef.current += 1;

    abortRef.current?.abort();
    const ac = new AbortController();
    abortRef.current = ac;

    // reset refs immediately to avoid "blocked by old loading"
    rowsLenRef.current = 0;
    hasMoreRef.current = true;
    loadingRef.current = false;

    setRows([]);
    setHasMore(true);
    setError(null);
    setLoading(false);

    void fetchRows(0, Math.min(PAGE_SIZE, MAX_ROWS), ac.signal);

    return () => {
      ac.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stat]);

  // Infinite load: do NOT attach until we have at least 1 row,
  // otherwise we can request offset=0 twice in some layouts.
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

  const visible = rows;

  if (error) console.error(error);

  return (
    <div className="min-h-screen bg-gradient-to-r from-indigo-400 to-blue-700 flex flex-col items-center p-6">
      <div className="bg-white rounded-xl shadow-2xl overflow-hidden w-full max-w-6xl">
        <div className="p-10">
          <h1 className="text-6xl font-swiss911 tracking-wider text-shadow-jeopardy text-yellow-400 mb-8 text-center">
            <div>Leaderboard</div>
            <div className="text-4xl mt-2">{selectedStat.label}</div>
          </h1>

          <div className="flex flex-wrap gap-3 justify-center mb-6">
            {STAT_OPTIONS.map((s) => (
              <button
                key={s.key}
                onClick={() => setStat(s.key)}
                className={[
                  "px-3 py-1.5 rounded-md text-xs sm:text-sm font-semibold shadow-md transition-all duration-200",
                  stat === s.key
                    ? "bg-blue-500 text-white border border-blue-600 scale-105 ring-2 ring-blue-300"
                    : "bg-gray-200 text-gray-700 hover:bg-gray-300 hover:scale-105",
                ].join(" ")}
              >
                {s.label}
              </button>
            ))}
          </div>

          <div className="hidden md:block">
            <div className="overflow-x-auto rounded-lg border border-gray-200">
              <table className="w-full text-left">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="px-4 py-3 text-sm font-semibold text-gray-700 w-20">Rank</th>
                    <th className="px-4 py-3 text-sm font-semibold text-gray-700">Player</th>
                    <th className="px-4 py-3 text-sm font-semibold text-gray-700 w-56 text-right">
                      {selectedStat.label}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {visible.map((r, i) => {
                    const rank = i + 1;

                    const pres = getProfilePresentation({
                      profile: toLeaderboardProfile(r),
                      fallbackName: r.displayname || r.username,
                      defaultNameColor: "#111827",
                    });

                    const rankBadge =
                      rank === 1
                        ? "bg-yellow-100 text-yellow-800 border-yellow-200"
                        : rank === 2
                          ? "bg-gray-100 text-gray-800 border-gray-200"
                          : rank === 3
                            ? "bg-orange-100 text-orange-800 border-orange-200"
                            : "bg-white text-gray-700 border-gray-200";

                    return (
                      <tr
                        key={`${r.username}-${i}`}
                        className="border-b border-gray-100 hover:bg-gray-50"
                      >
                        <td className="px-4 py-3">
                          <span
                            className={`inline-flex items-center justify-center min-w-10 px-2 py-1 text-xs font-bold rounded-md border ${rankBadge}`}
                          >
                            #{rank}
                          </span>
                        </td>

                        <td className="px-4 py-3">
                          <div className="flex items-center gap-3">
                            <div className="w-10 h-10 flex-shrink-0">
                              <Avatar
                                name={pres.avatar.nameForLetter}
                                color={pres.avatar.bgColor}
                                textColor={pres.avatar.fgColor}
                                icon={pres.avatar.icon}
                                size="10"
                              />
                            </div>

                            <div className="min-w-0">
                              <Link
                                to={`/profile/${encodeURIComponent(r.username)}`}
                                className="font-semibold text-gray-900 hover:underline"
                              >
                                <span
                                  className={pres.nameClassName}
                                  style={pres.nameStyle ?? undefined}
                                >
                                  {r.displayname || r.username}
                                </span>
                              </Link>
                              <div className="text-xs text-gray-500 truncate">@{r.username}</div>
                            </div>
                          </div>
                        </td>

                        <td className="px-4 py-3 text-right font-semibold text-gray-900">
                          {selectedStat.format(r.value)}
                        </td>
                      </tr>
                    );
                  })}

                  {visible.length === 0 && !loading && (
                    <tr>
                      <td colSpan={3} className="px-4 py-10 text-center text-gray-600 italic">
                        No players.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <div className="md:hidden space-y-3">
            {visible.map((r, i) => {
              const rank = i + 1;

              const pres = getProfilePresentation({
                profile: toLeaderboardProfile(r),
                fallbackName: r.displayname || r.username,
                defaultNameColor: "#111827",
              });

              return (
                <div
                  key={`${r.username}-${i}`}
                  className="bg-gray-50 border border-gray-200 rounded-lg p-4 shadow-sm"
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-10 h-10 flex-shrink-0">
                        <Avatar
                          name={pres.avatar.nameForLetter}
                          color={pres.avatar.bgColor}
                          textColor={pres.avatar.fgColor}
                          icon={pres.avatar.icon}
                          size="10"
                        />
                      </div>

                      <div className="min-w-0">
                        <Link
                          to={`/profile/${encodeURIComponent(r.username)}`}
                          className="font-semibold text-gray-900 hover:underline"
                        >
                          <span className={pres.nameClassName} style={pres.nameStyle ?? undefined}>
                            {r.displayname || r.username}
                          </span>
                        </Link>
                        <div className="text-xs text-gray-500 truncate">@{r.username}</div>
                      </div>
                    </div>

                    <div className="text-right flex-shrink-0">
                      <div className="text-xs text-gray-500">#{rank}</div>
                      <div className="font-semibold text-gray-900">
                        {selectedStat.format(r.value)}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}

            {visible.length === 0 && !loading && (
              <div className="text-center text-gray-600 italic py-6">No players.</div>
            )}
          </div>

          {loading && (
            <div className="text-center text-gray-700 my-6 italic">Loading leaderboard…</div>
          )}

          {!hasMore && !loading && rows.length > 0 && (
            <div className="text-center text-gray-700 my-6 italic">
              Showing top {Math.min(rows.length, MAX_ROWS).toLocaleString()} players.
            </div>
          )}

          <div ref={loadMoreRef} className="h-12" />
        </div>
      </div>
    </div>
  );
};

export default Leaderboard;

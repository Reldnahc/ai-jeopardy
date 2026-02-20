import { useState, useEffect, useRef } from "react";
import GameCard from "../components/recentboards/GameCard";
import { Board } from "../types/Board.ts";
import { models } from "../../shared/models.js";

function getApiBase() {
  // In dev, allow explicit override
  if (import.meta.env.DEV) {
    return import.meta.env.VITE_API_BASE || "http://localhost:3002";
  }

  // In prod, use same-origin
  return "";
}

function safeJsonParse(text: string): unknown {
  if (!text) return null;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return null;
  }
}

function getErrorMessage(payload: unknown, fallback: string) {
  if (payload && typeof payload === "object" && "error" in payload) {
    const e = (payload as Record<string, unknown>).error;
    if (typeof e === "string" && e.trim()) return e;
  }
  return fallback;
}

export async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  const text = await res.text();

  const payload = safeJsonParse(text);

  if (!res.ok) {
    const fallback = text?.trim() || `HTTP ${res.status}`;
    throw new Error(getErrorMessage(payload, fallback));
  }

  // If the server returns empty body on 204 etc
  if (payload === null) {
    return null as unknown as T;
  }

  return payload as T;
}

const RecentBoards = () => {
  const [boards, setBoards] = useState<Board[]>([]);
  const [loading, setLoading] = useState(false);
  const [hasMoreBoards, setHasMoreBoards] = useState(true);
  const [filterModel, setFilterModel] = useState<string | null>(null);
  const loadMoreRef = useRef<HTMLDivElement | null>(null);

  const fetchBoards = async (offset: number = 0, limit: number = 10) => {
    if (loading || !hasMoreBoards) return;
    setLoading(true);

    try {
      const api = getApiBase();
      const params = new URLSearchParams();
      params.set("offset", String(offset));
      params.set("limit", String(limit));
      if (filterModel) params.set("model", filterModel);

      const data = await fetchJson<{ boards: Board[] }>(
        `${api}/api/boards/recent?${params.toString()}`,
      );

      const newBoards = data.boards ?? [];
      setBoards((prev) => [...prev, ...newBoards]);

      if (newBoards.length < limit) setHasMoreBoards(false);
    } catch (e) {
      console.error("Error fetching boards:", e);
      setHasMoreBoards(false);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    setBoards([]);
    setHasMoreBoards(true);
  }, [filterModel]);

  useEffect(() => {
    // load first page when filter changes
    fetchBoards(0, 10);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterModel]);

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasMoreBoards && !loading) {
          fetchBoards(boards.length, 10);
        }
      },
      { threshold: 1.0 },
    );

    if (loadMoreRef.current) observer.observe(loadMoreRef.current);
    return () => observer.disconnect();
  }, [boards.length, loading, hasMoreBoards]);

  return (
    <div className="min-h-screen bg-gradient-to-r from-indigo-400 to-blue-700 flex flex-col items-center p-6">
      <div className="bg-white rounded-xl shadow-2xl overflow-hidden w-full max-w-6xl">
        <div className="p-10">
          <h1 className="text-6xl font-swiss911 tracking-wider text-shadow-jeopardy text-yellow-400 mb-8 text-center">
            <div> Recent Boards</div>
          </h1>

          <div className="flex flex-wrap gap-4 justify-center mb-6">
            {models.map((model) => (
              <button
                key={model.value}
                onClick={() => setFilterModel(model.value === filterModel ? null : model.value)}
                className={`px-3 py-1.5 rounded-md text-xs sm:text-sm font-semibold shadow-md ${
                  filterModel === model.value
                    ? "bg-blue-500 text-white border border-blue-600 scale-105 ring-2 ring-blue-300"
                    : "bg-gray-200 text-gray-700 hover:bg-gray-300 hover:scale-105"
                }`}
              >
                {model.label}
              </button>
            ))}
            <button
              onClick={() => setFilterModel(null)}
              className="px-4 py-2 rounded-md bg-red-500 hover:bg-red-600 text-white shadow-md hover:scale-105 transition-all duration-300 text-sm sm:text-base font-semibold"
            >
              Clear Filter
            </button>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {boards.map((game, idx) => (
              <GameCard key={idx} game={game} />
            ))}
          </div>

          {loading && (
            <div className="text-center text-gray-700 my-4 italic">Loading more boards...</div>
          )}
          {!hasMoreBoards && !loading && (
            <div className="text-center text-gray-700 my-4 italic">No more boards to load.</div>
          )}

          <div ref={loadMoreRef} className="h-12"></div>
        </div>
      </div>
    </div>
  );
};

export default RecentBoards;

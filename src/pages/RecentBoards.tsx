import { useState, useEffect, useRef, useCallback } from "react";
import GameCard from "../components/recentboards/GameCard";
import PageCardContainer from "../components/common/PageCardContainer.tsx";
import { Board } from "../types/Board.ts";
import { models } from "../../shared/models.js";
import { getApiBase, fetchJson } from "../utils/utils.ts";

const RecentBoards = () => {
  const [boards, setBoards] = useState<Board[]>([]);
  const [loading, setLoading] = useState(false);
  const [hasMoreBoards, setHasMoreBoards] = useState(true);
  const [filterModel, setFilterModel] = useState<string | null>(null);
  const loadingRef = useRef(false);
  const hasMoreRef = useRef(true);
  const lastRequestedOffsetRef = useRef<number | null>(null);
  const canTriggerAtBottomRef = useRef(true);

  const fetchBoards = useCallback(
    async (offset: number = 0, limit: number = 10) => {
      if (loadingRef.current || !hasMoreRef.current) return;
      loadingRef.current = true;
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

        if (newBoards.length < limit) {
          hasMoreRef.current = false;
          setHasMoreBoards(false);
        }
      } catch (e) {
        console.error("Error fetching boards:", e);
        hasMoreRef.current = false;
        setHasMoreBoards(false);
      } finally {
        loadingRef.current = false;
        setLoading(false);
      }
    },
    [filterModel],
  );

  useEffect(() => {
    setBoards([]);
    loadingRef.current = false;
    hasMoreRef.current = true;
    setLoading(false);
    setHasMoreBoards(true);
    lastRequestedOffsetRef.current = null;
    canTriggerAtBottomRef.current = true;
  }, [filterModel]);

  useEffect(() => {
    // load first page when filter changes
    fetchBoards(0, 10);
  }, [filterModel, fetchBoards]);

  useEffect(() => {
    const handleScroll = () => {
      if (loading || !hasMoreBoards) return;

      const doc = document.documentElement;
      const nearBottom = window.innerHeight + window.scrollY >= doc.scrollHeight - 8;

      // Must scroll away from the bottom before another bottom-trigger can fire.
      if (!nearBottom) {
        canTriggerAtBottomRef.current = true;
        return;
      }
      if (!canTriggerAtBottomRef.current) return;

      const offset = boards.length;
      if (lastRequestedOffsetRef.current === offset) return;
      canTriggerAtBottomRef.current = false;
      lastRequestedOffsetRef.current = offset;
      void fetchBoards(offset, 10);
    };

    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, [boards.length, loading, hasMoreBoards, fetchBoards]);

  return (
    <div className="min-h-screen flex flex-col items-center p-6">
      <PageCardContainer>
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
          <div className="h-12"></div>
        </div>
      </PageCardContainer>
    </div>
  );
};

export default RecentBoards;

import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import GameCard from "../components/recentboards/GameCard";
import PageCardContainer from "../components/common/PageCardContainer.tsx";
import FilterToolbar from "../components/common/FilterToolbar.tsx";
import SvgOutlinedText from "../components/common/SvgOutlinedText.tsx";
import { Board } from "../types/Board.ts";
import { models } from "../../shared/models.js";
import { getApiBase, fetchJson } from "../utils/utils.ts";

const RecentBoards = () => {
  const [boards, setBoards] = useState<Board[]>([]);
  const [loading, setLoading] = useState(false);
  const [hasMoreBoards, setHasMoreBoards] = useState(true);
  const [filterModel, setFilterModel] = useState<string | null>(null);
  const [search, setSearch] = useState("");
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

  const filteredBoards = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return boards;
    return boards.filter((b) => {
      const host = String(b.host ?? "").toLowerCase();
      const model = String(b.model ?? "").toLowerCase();
      const firstCats = (b.firstBoard?.categories ?? []).map((c) => String(c.category ?? "").toLowerCase());
      const secondCats = (b.secondBoard?.categories ?? []).map((c) =>
        String(c.category ?? "").toLowerCase(),
      );
      const finalCats = (b.finalJeopardy?.categories ?? []).map((c) =>
        String(c.category ?? "").toLowerCase(),
      );

      return (
        host.includes(q) ||
        model.includes(q) ||
        firstCats.some((c) => c.includes(q)) ||
        secondCats.some((c) => c.includes(q)) ||
        finalCats.some((c) => c.includes(q))
      );
    });
  }, [boards, search]);

  const modelSelectOptions = useMemo(
    () => [{ value: "", label: "All Models" }, ...models.map((m) => ({ value: m.value, label: m.label }))],
    [],
  );
  const modelChips = useMemo(
    () => [
      {
        key: "all",
        label: "All",
        active: filterModel === null,
        onClick: () => setFilterModel(null),
      },
      ...models.map((model) => ({
        key: model.value,
        label: model.label,
        active: filterModel === model.value,
        onClick: () => setFilterModel(model.value === filterModel ? null : model.value),
      })),
    ],
    [filterModel],
  );

  return (
    <div className="min-h-screen flex flex-col items-center px-4 py-6 md:px-6">
      <PageCardContainer className="border border-white/60 bg-white/95 shadow-[0_28px_70px_-32px_rgba(15,23,42,0.55)]">
        <div className="p-6 md:p-10">
          <div className="mb-8 rounded-2xl border border-blue-300/40 bg-gradient-to-br from-[#11336d] via-[#1f4f9b] to-[#143a7c] p-5 text-white shadow-[0_20px_40px_rgba(16,42,92,0.35)]">
            <div className="h-16 w-full md:h-20">
              <SvgOutlinedText
                text="Recent Boards"
                className="h-full w-full"
                fill="#facc15"
                shadowStyle="board"
                singleLine
                uppercase
              />
            </div>
            <p className="mt-2 text-center text-sm text-blue-100 md:text-base">
              Explore generated boards and filter by model, host, or categories
            </p>
          </div>

          <FilterToolbar
            selectLabel="Model"
            selectValue={filterModel ?? ""}
            onSelectChange={(value) => setFilterModel(value ? value : null)}
            selectOptions={modelSelectOptions}
            searchLabel="Search Boards"
            searchValue={search}
            onSearchChange={setSearch}
            searchPlaceholder="Host, model, or category"
            onReset={() => {
              setFilterModel(null);
              setSearch("");
            }}
            resetDisabled={filterModel === null && !search}
            chips={modelChips}
            summaryText={`Showing ${filteredBoards.length.toLocaleString()} of ${boards.length.toLocaleString()} loaded`}
          />

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {filteredBoards.map((game, idx) => (
              <GameCard key={idx} game={game} />
            ))}
          </div>

          {filteredBoards.length === 0 && !loading && (
            <div className="my-5 rounded-lg border border-dashed border-slate-300 bg-slate-50 p-4 text-center italic text-slate-700">
              No boards match the current filters.
            </div>
          )}

          {loading && (
            <div className="my-4 text-center italic text-slate-700">Loading more boards...</div>
          )}
          {!hasMoreBoards && !loading && (
            <div className="my-4 text-center italic text-slate-700">No more boards to load.</div>
          )}
          <div className="h-12"></div>
        </div>
      </PageCardContainer>
    </div>
  );
};

export default RecentBoards;

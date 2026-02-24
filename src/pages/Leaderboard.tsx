// frontend/pages/Leaderboard.tsx
import React, { useMemo, useState } from "react";
import PageCardContainer from "../components/common/PageCardContainer.tsx";
import FilterToolbar from "../components/common/FilterToolbar.tsx";
import LeaderboardHeader from "./leaderboard/LeaderboardHeader.tsx";
import LeaderboardDesktopTable from "./leaderboard/LeaderboardDesktopTable.tsx";
import LeaderboardMobileList from "./leaderboard/LeaderboardMobileList.tsx";
import { STAT_OPTIONS, MAX_ROWS, type StatKey } from "./leaderboard/leaderboardStats.ts";
import { useLeaderboardRows } from "./leaderboard/useLeaderboardRows.ts";

const Leaderboard: React.FC = () => {
  const [stat, setStat] = useState<StatKey>("money_won");
  const [search, setSearch] = useState("");

  const { rows, loading, hasMore, error, loadMoreRef } = useLeaderboardRows(stat);

  const selectedStat = useMemo(() => {
    return STAT_OPTIONS.find((s) => s.key === stat) ?? STAT_OPTIONS[0];
  }, [stat]);

  const statSelectOptions = useMemo(
    () => STAT_OPTIONS.map((s) => ({ value: s.key, label: s.label })),
    [],
  );

  const statChips = useMemo(
    () =>
      STAT_OPTIONS.map((s) => ({
        key: s.key,
        label: s.label,
        active: stat === s.key,
        onClick: () => setStat(s.key),
      })),
    [stat],
  );

  const normalizedSearch = search.trim().toLowerCase();
  const visible = useMemo(() => {
    if (!normalizedSearch) return rows;

    return rows.filter((r) => {
      const u = String(r.username ?? "").toLowerCase();
      const d = String(r.displayname ?? "").toLowerCase();
      return u.includes(normalizedSearch) || d.includes(normalizedSearch);
    });
  }, [normalizedSearch, rows]);

  if (error) console.error(error);

  return (
    <div className="min-h-screen flex flex-col items-center px-4 py-6 md:px-6">
      <PageCardContainer className="border border-white/60 bg-white/95 shadow-[0_26px_62px_-30px_rgba(15,23,42,0.55)]">
        <div className="mx-auto w-full max-w-5xl p-6 md:p-10">
          <LeaderboardHeader selectedStatLabel={selectedStat.label} />

          <FilterToolbar
            selectLabel="Stat"
            selectValue={stat}
            onSelectChange={(value) => setStat(value as StatKey)}
            selectOptions={statSelectOptions}
            searchLabel="Player Search"
            searchValue={search}
            onSearchChange={setSearch}
            searchPlaceholder="Search by username or display name"
            onReset={() => {
              setStat("money_won");
              setSearch("");
            }}
            resetDisabled={stat === "money_won" && !search}
            chips={statChips}
            summaryText={`Showing ${visible.length.toLocaleString()} of ${rows.length.toLocaleString()} loaded`}
          />

          <LeaderboardDesktopTable
            visible={visible}
            loading={loading}
            selectedStat={selectedStat}
            search={search}
          />

          <LeaderboardMobileList
            visible={visible}
            loading={loading}
            selectedStat={selectedStat}
            search={search}
          />

          {loading && (
            <div className="my-6 text-center italic text-slate-700">Loading leaderboard...</div>
          )}

          {!hasMore && !loading && rows.length > 0 && (
            <div className="my-6 text-center italic text-slate-700">
              Showing top {Math.min(rows.length, MAX_ROWS).toLocaleString()} players.
            </div>
          )}

          <div ref={loadMoreRef} className="h-12" />
        </div>
      </PageCardContainer>
    </div>
  );
};

export default Leaderboard;

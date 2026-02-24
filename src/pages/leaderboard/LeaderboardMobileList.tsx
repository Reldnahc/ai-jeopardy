import React from "react";
import type { LeaderboardRow } from "../../../backend/repositories/profile/profile.types.ts";
import type { StatOption } from "./leaderboardStats.ts";
import LeaderboardPlayerIdentity from "./LeaderboardPlayerIdentity.tsx";

interface LeaderboardMobileListProps {
  visible: LeaderboardRow[];
  loading: boolean;
  selectedStat: StatOption;
  search: string;
}

const LeaderboardMobileList: React.FC<LeaderboardMobileListProps> = ({
  visible,
  loading,
  selectedStat,
  search,
}) => {
  return (
    <div className="md:hidden space-y-3">
      {visible.map((r, i) => {
        const rank = i + 1;

        return (
          <div
            key={`${r.username}-${i}`}
            className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm"
          >
            <div className="flex items-center justify-between gap-3">
              <LeaderboardPlayerIdentity row={r} />

              <div className="text-right flex-shrink-0">
                <div className="text-xs text-slate-500">#{rank}</div>
                <div className="font-semibold text-slate-900">{selectedStat.format(r.value)}</div>
              </div>
            </div>
          </div>
        );
      })}

      {visible.length === 0 && !loading && (
        <div className="text-center text-gray-600 italic py-6">
          {search ? "No players match this search." : "No players."}
        </div>
      )}
    </div>
  );
};

export default LeaderboardMobileList;

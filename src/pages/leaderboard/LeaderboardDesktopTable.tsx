import React from "react";
import type { LeaderboardRow } from "../../../backend/repositories/profile/profile.types.ts";
import type { StatOption } from "./leaderboardStats.ts";
import LeaderboardPlayerIdentity from "./LeaderboardPlayerIdentity.tsx";

interface LeaderboardDesktopTableProps {
  visible: LeaderboardRow[];
  loading: boolean;
  selectedStat: StatOption;
  search: string;
}

function rankBadgeClass(rank: number) {
  if (rank === 1) return "bg-yellow-100 text-yellow-800 border-yellow-200";
  if (rank === 2) return "bg-gray-100 text-gray-800 border-gray-200";
  if (rank === 3) return "bg-orange-100 text-orange-800 border-orange-200";
  return "bg-white text-gray-700 border-gray-200";
}

const LeaderboardDesktopTable: React.FC<LeaderboardDesktopTableProps> = ({
  visible,
  loading,
  selectedStat,
  search,
}) => {
  return (
    <div className="hidden md:block">
      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
        <table className="w-full text-left">
          <thead className="border-b border-slate-200 bg-slate-50/80">
            <tr>
              <th className="w-20 px-4 py-3 text-sm font-semibold text-slate-700">Rank</th>
              <th className="px-4 py-3 text-sm font-semibold text-slate-700">Player</th>
              <th className="w-56 px-4 py-3 text-right text-sm font-semibold text-slate-700">
                {selectedStat.label}
              </th>
            </tr>
          </thead>
          <tbody>
            {visible.map((r, i) => {
              const rank = i + 1;

              return (
                <tr
                  key={`${r.username}-${i}`}
                  className="border-b border-slate-100 transition-colors hover:bg-blue-50/40"
                >
                  <td className="px-4 py-3">
                    <span
                      className={`inline-flex items-center justify-center min-w-10 px-2 py-1 text-xs font-bold rounded-md border ${rankBadgeClass(rank)}`}
                    >
                      #{rank}
                    </span>
                  </td>

                  <td className="px-4 py-3">
                    <LeaderboardPlayerIdentity row={r} />
                  </td>

                  <td className="px-4 py-3 text-right font-semibold text-slate-900">
                    {selectedStat.format(r.value)}
                  </td>
                </tr>
              );
            })}

            {visible.length === 0 && !loading && (
              <tr>
                <td colSpan={3} className="px-4 py-10 text-center text-gray-600 italic">
                  {search ? "No players match this search." : "No players."}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default LeaderboardDesktopTable;

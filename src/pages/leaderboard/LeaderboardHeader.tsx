import React from "react";
import SvgOutlinedText from "../../components/common/SvgOutlinedText.tsx";

interface LeaderboardHeaderProps {
  selectedStatLabel: string;
}

const LeaderboardHeader: React.FC<LeaderboardHeaderProps> = ({ selectedStatLabel }) => {
  return (
    <div className="mb-8 rounded-2xl border border-blue-200/45 bg-gradient-to-br from-[#214a8d] via-[#2d66ba] to-[#1e4f95] p-5 md:p-6 text-white shadow-[0_16px_30px_rgba(16,42,92,0.3)]">
      <div className="h-20 w-full md:h-24 lg:h-28">
        <SvgOutlinedText
          text="Leaderboard"
          className="h-full w-full"
          fill="#facc15"
          shadowStyle="board"
          singleLine
          uppercase
        />
      </div>
      <p className="mt-2 text-center text-sm text-blue-100 md:text-base">
        Ranked by <span className="font-semibold text-white">{selectedStatLabel}</span>
      </p>
    </div>
  );
};

export default LeaderboardHeader;

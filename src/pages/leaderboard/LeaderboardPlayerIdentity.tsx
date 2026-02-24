import React from "react";
import { Link } from "react-router-dom";
import Avatar from "../../components/common/Avatar";
import { getProfilePresentation } from "../../utils/profilePresentation";
import type { LeaderboardRow } from "../../../backend/repositories/profile/profile.types.ts";
import { toLeaderboardProfile } from "./leaderboardProfile.ts";

interface LeaderboardPlayerIdentityProps {
  row: LeaderboardRow;
}

const LeaderboardPlayerIdentity: React.FC<LeaderboardPlayerIdentityProps> = ({ row }) => {
  const pres = getProfilePresentation({
    profile: toLeaderboardProfile(row),
    fallbackName: row.displayname || row.username,
    defaultNameColor: "#111827",
  });

  return (
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
          to={`/profile/${encodeURIComponent(row.username)}`}
          className="font-semibold text-slate-900 hover:underline"
        >
          <span className={pres.nameClassName} style={pres.nameStyle ?? undefined}>
            {row.displayname || row.username}
          </span>
        </Link>
        <div className="truncate text-xs text-slate-500">@{row.username}</div>
      </div>
    </div>
  );
};

export default LeaderboardPlayerIdentity;

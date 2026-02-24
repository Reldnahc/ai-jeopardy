import React from "react";
import Avatar from "../../../../components/common/Avatar.tsx";
import type { Profile } from "../../../../contexts/ProfileContext.tsx";
import type { Player } from "../../../../types/Lobby.ts";
import type { ProfilePresentation } from "../../../../utils/profilePresentation";
import { getProfilePresentation } from "../../../../utils/profilePresentation";
import GamePlayerRow from "../GamePlayerRow.tsx";
import FittedStatusName from "./FittedStatusName.tsx";
import RollerMoney from "./RollerMoney.tsx";

interface SidebarContestantsPanelProps {
  players: Player[];
  scores: Record<string, number>;
  getProfileByUsername: (username: string) => Profile | null;
  selectorPlayer: Player | null;
  selectorPres: ProfilePresentation;
  buzzedPlayer: Player | null;
  buzzedPres: ProfilePresentation;
  showScoreButtons: boolean;
  lastQuestionValue: number;
  handleScoreUpdate: (player: string, delta: number) => void;
}

const SidebarContestantsPanel: React.FC<SidebarContestantsPanelProps> = ({
  players,
  scores,
  getProfileByUsername,
  selectorPlayer,
  selectorPres,
  buzzedPlayer,
  buzzedPres,
  showScoreButtons,
  lastQuestionValue,
  handleScoreUpdate,
}) => {
  return (
    <div className="flex flex-col gap-0 w-full" style={{ fontFamily: "'Poppins', sans-serif" }}>
      <div>
        <h2 className="text-4xl font-extrabold font-swiss911 text-shadow-jeopardy tracking-wider bg-blue-700 text-white px-5 py-5 rounded-lg text-center w-full gap-2.5 shadow-md mb-3">
          CONTESTANTS
        </h2>

        <div className="mb-3 grid grid-cols-2 gap-2">
          <div className="rounded-md bg-white/85 border border-slate-200 px-2 py-1.5 shadow-sm">
            <div className="text-[10px] uppercase tracking-wide text-slate-500 font-semibold">
              Selector
            </div>
            <div className="mt-1 flex items-center justify-center lg:justify-start gap-2 min-h-8">
              {selectorPlayer ? (
                <>
                  <Avatar
                    name={selectorPres.avatar.nameForLetter}
                    size="7"
                    color={selectorPres.avatar.bgColor}
                    textColor={selectorPres.avatar.fgColor}
                    icon={selectorPres.avatar.icon}
                  />
                  <FittedStatusName
                    text={selectorPres.displayName}
                    className={selectorPres.nameClassName}
                    style={selectorPres.nameStyle}
                  />
                </>
              ) : (
                <FittedStatusName text="None" className="font-semibold text-slate-700" />
              )}
            </div>
          </div>

          <div className="rounded-md bg-white/85 border border-slate-200 px-2 py-1.5 shadow-sm">
            <div className="text-[10px] uppercase tracking-wide text-slate-500 font-semibold">
              Buzzed
            </div>
            <div className="mt-1 flex items-center justify-center lg:justify-start gap-2 min-h-8">
              {buzzedPlayer ? (
                <>
                  <Avatar
                    name={buzzedPres.avatar.nameForLetter}
                    size="7"
                    color={buzzedPres.avatar.bgColor}
                    textColor={buzzedPres.avatar.fgColor}
                    icon={buzzedPres.avatar.icon}
                  />
                  <FittedStatusName
                    text={buzzedPres.displayName}
                    className={buzzedPres.nameClassName}
                    style={buzzedPres.nameStyle}
                  />
                </>
              ) : (
                <FittedStatusName text="None" className="font-semibold text-slate-700" />
              )}
            </div>
          </div>
        </div>

        <ul className="list-none p-0 m-0">
          {players.map((player) => {
            const username = String(player.username ?? "").trim();

            const publicProfile = username ? getProfileByUsername(username) : null;

            const pres = getProfilePresentation({
              profile: publicProfile,
              fallbackName: username,
              defaultNameColor: undefined,
            });

            const score = scores[username] ?? 0;

            return (
              <GamePlayerRow
                key={username}
                player={player}
                username={username}
                pres={pres}
                score={score}
                showScoreButtons={showScoreButtons}
                lastQuestionValue={lastQuestionValue}
                handleScoreUpdate={handleScoreUpdate}
                RollerMoney={RollerMoney}
              />
            );
          })}
        </ul>
      </div>
    </div>
  );
};

export default SidebarContestantsPanel;

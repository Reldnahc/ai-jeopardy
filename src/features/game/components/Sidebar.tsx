import React, { useEffect, useMemo } from "react";
import { useProfile } from "../../../contexts/ProfileContext.tsx";
import { getProfilePresentation } from "../../../utils/profilePresentation";
import { atLeast } from "../../../../shared/roles.ts";
import { useAlert } from "../../../contexts/AlertContext.tsx";
import { useUniqueUsernames } from "../../../hooks/useUniqueUsernames.ts";
import SidebarContestantsPanel from "./sidebar/SidebarContestantsPanel.tsx";
import SidebarBottomControls from "./sidebar/SidebarBottomControls.tsx";
import type { SidebarProps } from "./sidebar/Sidebar.types.ts";

const Sidebar: React.FC<SidebarProps> = ({
  players,
  scores,
  lastQuestionValue,
  activeBoard,
  handleScoreUpdate,
  markAllCluesComplete,
  buzzResult,
  narrationEnabled,
  onLeaveGame,
  selectorName,
  micPermission,
  showAutoplayReminder,
  onRequestMicPermission,
  audioVolume,
  onChangeAudioVolume,
  onToggleDailyDoubleSnipe,
}) => {
  const { profile: me, getProfileByUsername, fetchPublicProfiles } = useProfile();
  const { showAlert } = useAlert();

  const usernames = useUniqueUsernames(players);

  useEffect(() => {
    if (usernames.length === 0) return;
    void fetchPublicProfiles(usernames).catch(() => {});
  }, [usernames, fetchPublicProfiles]);

  const selectorPlayer = useMemo(() => {
    const selector = String(selectorName ?? "").trim();
    if (!selector) return null;

    return (
      players.find(
        (p) =>
          String(p.displayname ?? "")
            .trim()
            .toLowerCase() === selector.toLowerCase(),
      ) ?? null
    );
  }, [players, selectorName]);

  const buzzedPlayer = useMemo(() => {
    const buzzed = String(buzzResult ?? "")
      .trim()
      .toLowerCase();
    if (!buzzed) return null;

    return (
      players.find(
        (p) =>
          String(p.username ?? "")
            .trim()
            .toLowerCase() === buzzed,
      ) ?? null
    );
  }, [players, buzzResult]);

  const selectorUsername = String(selectorPlayer?.username ?? "").trim();
  const buzzedUsername = String(buzzedPlayer?.username ?? "").trim();

  const selectorPres = getProfilePresentation({
    profile: selectorUsername ? getProfileByUsername(selectorUsername) : null,
    fallbackName: String((selectorPlayer?.displayname ?? selectorUsername) || "None"),
    defaultNameColor: undefined,
  });

  const buzzedPres = getProfilePresentation({
    profile: buzzedUsername ? getProfileByUsername(buzzedUsername) : null,
    fallbackName: String((buzzedPlayer?.displayname ?? buzzedUsername) || "None"),
    defaultNameColor: undefined,
  });

  const showScoreButtons = Boolean(me && atLeast(me.role, "admin"));
  const isAdmin = Boolean(me && atLeast(me.role, "admin"));

  const onTryLeaveGame = () => {
    void showAlert(
      "Leave Game",
      <span>
        Leaving means you will quit this game, your score will be wiped and you may not be able to
        rejoin.
      </span>,
      [
        {
          label: "Leave",
          actionValue: "leave",
          styleClass: "bg-red-600 text-white hover:bg-red-700",
        },
        {
          label: "Cancel",
          actionValue: "cancel",
          styleClass: "bg-gray-300 text-black hover:bg-gray-400",
        },
      ],
    ).then((action) => {
      if (action === "leave") onLeaveGame();
    });
  };

  return (
    <div className="flex-none w-full md:w-64 lg:w-96 flex flex-col gap-5 p-3 overflow-hidden box-border relative h-full">
      <SidebarContestantsPanel
        players={players}
        scores={scores}
        getProfileByUsername={getProfileByUsername}
        selectorPlayer={selectorPlayer}
        selectorPres={selectorPres}
        buzzedPlayer={buzzedPlayer}
        buzzedPres={buzzedPres}
        showScoreButtons={showScoreButtons}
        lastQuestionValue={lastQuestionValue}
        handleScoreUpdate={handleScoreUpdate}
      />

      <SidebarBottomControls
        micPermission={micPermission}
        showAutoplayReminder={showAutoplayReminder}
        onRequestMicPermission={onRequestMicPermission}
        isAdmin={isAdmin}
        activeBoard={activeBoard}
        markAllCluesComplete={markAllCluesComplete}
        onToggleDailyDoubleSnipe={onToggleDailyDoubleSnipe}
        narrationEnabled={narrationEnabled}
        audioVolume={audioVolume}
        onChangeAudioVolume={onChangeAudioVolume}
        onTryLeaveGame={onTryLeaveGame}
      />
    </div>
  );
};

export default Sidebar;

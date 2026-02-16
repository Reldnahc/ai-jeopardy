import React, { useEffect, useMemo } from "react";
import Avatar from "../common/Avatar";
import type { Player } from "../../types/Lobby";
import { useProfile } from "../../contexts/ProfileContext";
import { getProfilePresentation } from "../../utils/profilePresentation";

interface LobbySidebarProps {
    gameId: string | undefined;
    host: string | null; // host username
    players: Player[];   // players contain username at minimum
    copySuccess: boolean;
    setCopySuccess: React.Dispatch<React.SetStateAction<boolean>>;
    isHost: boolean;
    onPromoteHost: (playerUsername: string) => void;
}

const LobbySidebar: React.FC<LobbySidebarProps> = ({
                                                       gameId,
                                                       host,
                                                       players,
                                                       copySuccess,
                                                       setCopySuccess,
                                                       isHost,
                                                       onPromoteHost,
                                                   }) => {
    const copyGameIdToClipboard = () => {
        if (!gameId) return;
        navigator.clipboard.writeText(gameId);
        setCopySuccess(true);
        setTimeout(() => setCopySuccess(false), 2000);
    };

    const { getProfileByUsername, fetchPublicProfiles } = useProfile();

    // Dedup usernames so we don't spam fetches
    const usernames = useMemo(() => {
        const set = new Set<string>();
        for (const p of players) {
            const u = String((p).username ?? "").trim();
            if (u) set.add(u);
        }
        return Array.from(set);
    }, [players]);

    useEffect(() => {
        if (usernames.length === 0) return;
        void fetchPublicProfiles(usernames).catch(() => {});
    }, [usernames, fetchPublicProfiles]);

    return (
        <div className="flex flex-col h-full w-full gap-5 box-border relative z-30">
            {/* Game ID and Host Card */}
            <div
                onClick={copyGameIdToClipboard}
                className="
          bg-blue-700 text-white rounded-lg px-6 py-4 text-center shadow-md
          cursor-pointer transition-all duration-200 hover:scale-[1.02] hover:shadow-lg
          active:scale-[0.98] select-none
        "
            >
                <div className="text-xs tracking-widest opacity-80">Lobby ID</div>
                <div className="font-swiss911 text-3xl tracking-[0.15em] text-shadow-jeopardy mt-1">
                    {gameId}
                </div>
                <div className="text-xs mt-1 opacity-70">Click to copy</div>
            </div>

            <div className="relative w-full flex justify-center">
                {copySuccess && (
                    <div
                        className="
              absolute top-full -mt-8 px-5 py-2 bg-green-600 text-white font-semibold
              tracking-wider rounded-md shadow-md text-shadow-jeopardy
            "
                    >
                        ✓ GAME ID COPIED
                    </div>
                )}
            </div>

            {/* Player List Section */}
            <div className="flex flex-col gap-1 -mt-10">
                <h2 className="text-4xl mt-3 font-extrabold font-swiss911 text-shadow-jeopardy tracking-wider bg-blue-700 text-white px-5 py-5 rounded-lg text-center w-full gap-2.5 shadow-md mb-3">
                    CONTESTANTS
                </h2>

                <ul className="list-none p-0 m-0 flex flex-wrap lg:flex-col lg:w-full gap-4">
                    {players.map((player, index) => {
                        const username = String((player).username ?? "").trim();

                        const profile = username ? getProfileByUsername(username) : null;

                        const pres = getProfilePresentation({
                            profile,
                            fallbackName: username,
                            defaultNameColor: undefined, // let helper default (#ffffff) unless profile has name_color
                        });

                        const isHostRow = host === username;

                        return (
                            <li
                                key={`${username || "player"}-${index}`}
                                className={[
                                    "flex items-center w-full lg:w-full p-3 rounded-lg text-base shadow-sm",
                                    "text-blue-500",
                                    isHostRow ? "bg-yellow-200" : "bg-gray-100",
                                ].join(" ")}
                            >
                                <Avatar
                                    name={pres.avatar.nameForLetter}
                                    size="8"
                                    color={pres.avatar.bgColor}
                                    textColor={pres.avatar.fgColor}
                                    icon={pres.avatar.icon}
                                />

                                <div className="flex flex-col ml-3">
                  <span
                      className={[
                          pres.nameClassName,
                          isHostRow ? "font-bold" : "",
                      ].join(" ")}
                      style={pres.nameStyle}
                  >
                    {pres.displayName || username}
                  </span>

                                    {isHostRow && (
                                        <span className="text-yellow-500 text-sm -mt-2">Host</span>
                                    )}

                                    {isHost && !isHostRow && (
                                        <button
                                            type="button"
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                onPromoteHost(username);
                                            }}
                                            className="mt-1 px-2 py-1 rounded bg-blue-600 text-white text-xs hover:bg-blue-500 w-fit"
                                        >
                                            Make Host
                                        </button>
                                    )}
                                </div>
                            </li>
                        );
                    })}
                </ul>
            </div>
        </div>
    );
};

export default LobbySidebar;

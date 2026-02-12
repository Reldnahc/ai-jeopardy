import React from "react";
import Avatar from "../common/Avatar.tsx";
import { Player } from "../../types/Lobby.ts";

interface LobbySidebarProps {
    gameId: string | undefined;
    host: string | null;
    players: Player[];
    copySuccess: boolean;
    setCopySuccess: React.Dispatch<React.SetStateAction<boolean>>;
    isHost: boolean;
    onPromoteHost: (playerName: string) => void;
}

const LobbySidebar: React.FC<LobbySidebarProps> = ({
                                                       gameId,
                                                       host,
                                                       players,
                                                       copySuccess,
                                                       setCopySuccess,
                                                       isHost,
                                                       onPromoteHost
                                                   }) => {
    const copyGameIdToClipboard = () => {
        if (gameId) {
            navigator.clipboard.writeText(gameId); // Copy Game ID to clipboard
            setCopySuccess(true); // Show toast
            setTimeout(() => setCopySuccess(false), 2000);
        }
    };

    return (
        <div className="flex flex-col h-full w-full gap-5 box-border relative z-30">
            {/* Game ID and Host Card */}
            <div
                onClick={copyGameIdToClipboard}
                className="
        bg-blue-700
        text-white
        rounded-lg
        px-6
        py-4
        text-center
        shadow-md
        cursor-pointer
        transition-all
        duration-200
        hover:scale-[1.02]
        hover:shadow-lg
        active:scale-[0.98]
        select-none
    "
            >
                <div className="text-xs tracking-widest opacity-80">
                    Lobby ID
                </div>

                <div className="font-swiss911 text-3xl tracking-[0.15em] text-shadow-jeopardy mt-1">
                    {gameId}
                </div>

                <div className="text-xs mt-1 opacity-70">
                    Click to copy
                </div>
            </div>

            <div className="relative w-full flex justify-center">
                {copySuccess && (
                    <div
                        className="
                absolute
                top-full
                -mt-8
                px-5
                py-2
                bg-green-600
                text-white
                font-semibold
                tracking-wider
                rounded-md
                shadow-md
                text-shadow-jeopardy
            "
                    >
                        ✓ GAME ID COPIED
                    </div>
                )}
            </div>



            {/* Player List Section */}
            <div className="flex flex-col gap-1 -mt-10">
                <h2 className="text-4xl  mt-3 font-extrabold font-swiss911 text-shadow-jeopardy tracking-wider bg-blue-700 text-white px-5 py-5 rounded-lg text-center w-full gap-2.5 shadow-md mb-3">
                    CONTESTANTS
                </h2>
                {/* Responsive Player List */}
                <ul
                    className="list-none p-0 m-0 flex flex-wrap lg:flex-col lg:w-full gap-4"
                >
                    {players.map((player, index) => (
                        <li
                            key={index}
                            className={`flex items-center w-full lg:w-full p-3 rounded-lg text-base shadow-sm text-blue-500 ${
                                host === player.name ? "bg-yellow-200" : "bg-gray-100"
                            }`}
                        >
                            <Avatar
                                name={player.name}
                                size="8"
                                color={player.color}
                                textColor={player.text_color}
                            />
                            <div className="flex flex-col ml-3">
                                <span className={host === player.name ? "font-bold" : ""}>
                                    {player.name}
                                </span>
                                {host === player.name && (
                                    <span className="text-yellow-500 text-sm -mt-2">Host</span>
                                )}
                                {isHost && host !== player.name && (
                                    <button
                                        type="button"
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            onPromoteHost(player.name);
                                        }}
                                        className="mt-1 px-2 py-1 rounded bg-blue-600 text-white text-xs hover:bg-blue-500 w-fit"
                                    >
                                        Make Host
                                    </button>
                                )}

                            </div>
                        </li>
                    ))}
                </ul>
            </div>
        </div>
    );
};

export default LobbySidebar;
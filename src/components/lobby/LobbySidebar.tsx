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
                className="bg-gradient-to-br from-[#6a11cb] to-[#2575fc] text-white rounded-xl p-5 shadow-lg transition-all duration-200 cursor-pointer hover:scale-105 hover:shadow-xl"
            >
                <p className="text-lg font-bold m-0">
                    <strong>Lobby ID:</strong> {gameId}
                </p>
                <p className="text-sm text-center mt-2 -mb-3">
                    (click to copy)
                </p>
            </div>

            <div className="relative">
                {copySuccess && (
                    <div className="absolute -mt-2 px-3.5 py-2.5 left-3 bg-green-500 rounded-md text-white text-sm text-center shadow-md">
                        Game ID copied to clipboard!
                    </div>
                )}
            </div>

            {/* Player List Section */}
            <div className="flex flex-col gap-3 -mt-7">
                <h2 className="text-2xl font-extrabold bg-gradient-to-r from-[#1e88e5] via-[#3d5afe] to-[#5c6bc0] text-white px-5 py-5 rounded-lg text-center shadow-md">
                    Players
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
import React from "react";
import {useProfile} from "../../contexts/ProfileContext.tsx";
import Avatar from "../common/Avatar.tsx";
import {Player} from "../../types/Lobby.ts";

interface SidebarProps {
    isHost: boolean;
    host: string | null;
    players: Player[];
    scores: Record<string, number>;
    lastQuestionValue: number;
    activeBoard: string;
    handleScoreUpdate: (player: string, delta: number) => void;
    markAllCluesComplete: () => void;
    buzzResult: string | null;
    onLeaveGame: () => void;
}

const Sidebar: React.FC<SidebarProps> = ({
                                             isHost,
                                             host,
                                             players,
                                             scores,
                                             lastQuestionValue,
                                             activeBoard,
                                             handleScoreUpdate,
                                             markAllCluesComplete,
                                             buzzResult,
                                             onLeaveGame,
                                         }) => {

    const { profile } = useProfile();

    return (
        <div className="flex-none w-full md:w-72 flex flex-col items-start gap-5 p-5 overflow-hidden box-border relative">
            <div className="flex flex-col gap-0 p-1 w-full" style={{ fontFamily: "'Poppins', sans-serif" }}>
                <button
                    className="w-full mb-3 px-4 py-2 rounded-lg bg-red-700 text-white font-bold hover:bg-red-900"
                    onClick={() => {
                        const ok = window.confirm(
                            "Leave the game?\n\nLeaving means you will quit this game and may not be able to rejoin."
                        );
                        if (ok) onLeaveGame();
                    }}
                >
                    Leave Game
                </button>
                <div>
                    <h2 className="text-2xl mt-3 font-extrabold bg-gradient-to-r from-[#1e88e5] via-[#3d5afe] to-[#5c6bc0] text-white px-5 py-5 rounded-lg text-center flex items-center gap-2.5 shadow-md mb-3">
                        Players
                    </h2>
                    <ul className="list-none p-0 m-0">
                        {players.map((player) => (
                                <li
                                key={player.name}
                                className={`flex items-center p-2.5 rounded-lg mb-2 text-base shadow-sm text-blue-500 
                                ${player.online === false ? "opacity-50" : ""}
                                ${host === player.name
                                        ? "bg-yellow-200 border-yellow-500 border-2"
                                        : buzzResult === player.name
                                            ? "bg-red-300 border-red-500 border-2"
                                            : `bg-gray-100`}
                                            `}
                            >
                                <Avatar name={player.name} size="8" color={player.color} textColor={player.text_color} />
                                <div className="flex flex-col flex-1 ml-3">
                                      <span className="font-bold">
                                        {player.name}
                                      </span>
                                    {host === player.name && players.length > 1 ? (
                                        <span className="text-yellow-500 -mt-2 text-sm">Host</span>
                                    ) : (
                                        <span
                                            className={`-mt-1.5 font-bold text-sm ${
                                                scores[player.name] < 0 ? "text-red-500" : "text-green-500"
                                            }`}
                                        >
                                         ${scores[player.name] || 0}
                                        </span>
                                    )}
                                </div>
                                {isHost && (player.name !== host || players.length === 1) && (
                                    <div className="flex gap-2 ml-auto">
                                        <button
                                            onClick={() => handleScoreUpdate(player.name, -lastQuestionValue)}
                                            className="w-8 h-8 p-0 bg-red-500 text-white rounded-full flex items-center justify-center text-sm hover:bg-red-600"
                                        >
                                            −
                                        </button>
                                        <button
                                            onClick={() => handleScoreUpdate(player.name, lastQuestionValue)}
                                            className="w-8 h-8 p-0 bg-green-500 text-white rounded-full flex items-center justify-center text-sm hover:bg-green-600"
                                        >
                                            ＋
                                        </button>
                                    </div>
                                )}
                            </li>
                        ))}
                    </ul>
                </div>
            </div>


            {/* Fixed Bottom Section */}
            <div className="fixed bottom-0 left-0 w-full md:w-72 flex flex-col items-center gap-5 z-[100]">
                {profile && profile.role === 'admin' && isHost && activeBoard !== "finalJeopardy" && (
                    <button
                        onClick={markAllCluesComplete}
                        className="px-10 py-5 bg-red-700 text-white text-xl font-bold border-none rounded-lg cursor-pointer min-w-72 hover:bg-red-800"
                    >
                        Mark All Questions Complete
                    </button>
                )}
            </div>
        </div>
    );
};

export default Sidebar;
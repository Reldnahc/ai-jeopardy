import React from "react";
import {useProfile} from "../../contexts/ProfileContext.tsx";
import Avatar from "../common/Avatar.tsx";
import {Player} from "../../types/Lobby.ts";
import MutedIcon from "../../icons/MutedIcon.tsx";
import LoudIcon from "../../icons/LoudIcon.tsx";

interface SidebarProps {
    players: Player[];
    scores: Record<string, number>;
    lastQuestionValue: number;
    activeBoard: string;
    handleScoreUpdate: (player: string, delta: number) => void;
    markAllCluesComplete: () => void;
    buzzResult: string | null;
    narrationEnabled: boolean;
    onLeaveGame: () => void;
    selectorName: string | null;
    audioVolume: number; // 0..1
    onChangeAudioVolume: (v: number) => void;
}

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
                                             audioVolume,
                                             onChangeAudioVolume,
                                         }) => {

    const { profile } = useProfile();

    return (
        <div className="flex-none w-full md:w-72 flex flex-col items-start gap-5 p-5 overflow-hidden box-border relative">
            <div className="flex flex-col gap-0 p-1 w-full" style={{ fontFamily: "'Poppins', sans-serif" }}>
                {/* Top Controls (compact) */}
                <div className="w-full mb-3">
                    <div className="flex items-center justify-between gap-2">
                        {/* Right: icon buttons */}
                        <div className="flex items-center gap-2">
                            {/* Leave game (icon only, subtle danger) */}
                            <button
                                type="button"
                                onClick={() => {
                                    const ok = window.confirm(
                                        "Leave the game?\n\nLeaving means you will quit this game and may not be able to rejoin."
                                    );
                                    if (ok) onLeaveGame();
                                }}
                                className="
                                            group
                                            inline-flex items-center justify-center
                                            w-9 h-9
                                            rounded-xl
                                            border border-gray-200
                                            bg-white
                                            text-gray-500
                                            shadow-sm
                                            transition
                                            hover:bg-red-50 hover:text-red-600 hover:border-red-200
                                            active:scale-[0.98]
                                            focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500
                                        "
                                title="Leave game"
                                aria-label="Leave game"
                            >
                                <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                                    <path d="M10 17l1.41-1.41L8.83 13H20v-2H8.83l2.58-2.59L10 7l-5 5 5 5z" />
                                </svg>

                            </button>
                            {/* Narration toggle */}
                            {narrationEnabled && (
                                <div className="flex items-center gap-3 ml-2 select-none">
                                    {/* Muted speaker */}
                                    <MutedIcon
                                        className={"-mr-3"}
                                    />

                                    {/* Slider */}
                                    <input
                                        type="range"
                                        min={0}
                                        max={200}
                                        step={1}
                                        value={Math.round(audioVolume * 100)}
                                        onChange={(e) => onChangeAudioVolume(Number(e.target.value) / 100)}
                                        className="
                                                    w-32
                                                    accent-white
                                                    cursor-pointer
                                                  "
                                        aria-label="Audio volume"
                                    />

                                    {/* Loud speaker */}
                                    <LoudIcon
                                        className={"-ml-2"}
                                    />

                                </div>

                            )}
                        </div>
                    </div>
                </div>



                <div>
                    <h2 className="text-2xl mt-3 font-extrabold bg-gradient-to-r from-[#1e88e5] via-[#3d5afe] to-[#5c6bc0] text-white px-5 py-5 rounded-lg text-center flex items-center gap-2.5 shadow-md mb-3">
                        Players
                    </h2>
                    <ul className="list-none p-0 m-0">
                        {players.map((player) => (
                            <li
                                key={player.name}
                                className={`
                                    flex items-center
                                    p-2
                                    min-h-[96px]
                                    rounded-xl
                                    mb-3
                                    text-blue-500
                                    shadow-sm
                                    border-2 border-transparent
                                    ${player.online === false ? "opacity-50" : ""}
                                    ${buzzResult === player.name
                                    ? "bg-red-300 border-red-500"
                                    : selectorName === player.name
                                        ? "bg-blue-300 border-blue-500"
                                        : "bg-gray-100"}
                                    `}
                            >
                                {/* Bigger avatar */}
                                <Avatar
                                    name={player.name}
                                    size="16"
                                    color={player.color}
                                    textColor={player.text_color}
                                />

                                {/* Bigger name + money */}
                                <div className="flex flex-col flex-1 ml-2 leading-tight">
                                    <span className="font-extrabold text-xl">
                                      {player.name}
                                    </span>

                                    <span
                                        className={`mt-1 font-extrabold text-2xl ${
                                            scores[player.name] < 0 ? "text-red-600" : "text-green-600"
                                        }`}
                                    >
                                      ${scores[player.name] || 0}
                                    </span>
                                </div>

                                {/* Admin controls: stacked vertically */}
                                {profile && profile.role === "admin" && (
                                    <div className="flex flex-col gap-2 ml-3">
                                        <button
                                            onClick={() => handleScoreUpdate(player.name, lastQuestionValue)}
                                            className="
                                              w-6 h-6
                                              bg-green-500 text-white
                                              rounded-xl
                                              flex items-center justify-center
                                              text-lg font-black
                                              shadow-sm
                                              hover:bg-green-600
                                              active:scale-[0.98]
                                            "
                                            aria-label={`Increase ${player.name} score`}
                                            title={`+${lastQuestionValue}`}
                                        >
                                            ＋
                                        </button>

                                        <button
                                            onClick={() => handleScoreUpdate(player.name, -lastQuestionValue)}
                                            className="
                                              w-6 h-6
                                              bg-red-500 text-white
                                              rounded-xl
                                              flex items-center justify-center
                                              text-lg font-black
                                              shadow-sm
                                              hover:bg-red-600
                                              active:scale-[0.98]
                                            "
                                            aria-label={`Decrease ${player.name} score`}
                                            title={`-${lastQuestionValue}`}
                                        >
                                            −
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
                {profile && profile.role === 'admin' && activeBoard !== "finalJeopardy" && (
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
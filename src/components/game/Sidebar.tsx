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
    narrationEnabled: boolean;
    audioMuted: boolean;
    onToggleAudioMuted: () => void;
    onLeaveGame: () => void;
    selectorName: string | null;
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
                                             narrationEnabled,
                                             audioMuted,
                                             onToggleAudioMuted,
                                             onLeaveGame,
                                             selectorName,
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
                            {/* Narration toggle (icon only) */}
                            {narrationEnabled && (
                                <button
                                    type="button"
                                    onClick={onToggleAudioMuted}
                                    className={`
                                                group
                                                inline-flex items-center justify-center
                                                w-9 h-9
                                                rounded-xl
                                                border
                                                shadow-sm
                                                transition
                                                active:scale-[0.98]
                                                focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500
                                                ${
                                        audioMuted
                                            ? "bg-gray-900 text-white border-gray-900"
                                            : "bg-white text-gray-700 border-gray-200 hover:bg-gray-50"
                                             }
                                        `}
                                    title={audioMuted ? "Unmute narration" : "Mute narration"}
                                    aria-label={audioMuted ? "Unmute narration" : "Mute narration"}
                                    aria-pressed={audioMuted}
                                >
                                    {audioMuted ? (
                                        // Muted icon
                                        <svg
                                            className="w-5 h-5"
                                            viewBox="0 0 24 24"
                                            fill="currentColor"
                                            aria-hidden="true"
                                        >
                                            <path d="M4 9v6h4l5 5V4L8 9H4z" />
                                            <path d="M21 3.8 19.6 2.4 2.4 19.6 3.8 21 21 3.8z" />
                                        </svg>
                                    ) : (
                                        // Volume icon
                                        <svg
                                            className="w-5 h-5"
                                            viewBox="0 0 24 24"
                                            fill="currentColor"
                                            aria-hidden="true"
                                        >
                                            <path d="M4 9v6h4l5 5V4L8 9H4z" />
                                            <path d="M16.5 12c0-1.77-1.02-3.29-2.5-4.03v8.06c1.48-.74 2.5-2.26 2.5-4.03z" />
                                            <path d="M19 12c0 2.5-1.5 4.66-3.66 5.65l.74 1.5C18.74 18.01 20.5 15.18 20.5 12s-1.76-6.01-4.42-7.15l-.74 1.5C17.5 7.34 19 9.5 19 12z" />
                                        </svg>
                                    )}
                                </button>
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
                                className={`flex items-center p-2.5 rounded-lg mb-2 text-base shadow-sm text-blue-500
                                    border-2 border-transparent
                                    ${player.online === false ? "opacity-50" : ""}
                                    ${host === player.name
                                    ? "bg-yellow-200 border-yellow-500"
                                    : buzzResult === player.name
                                        ? "bg-red-300 border-red-500"
                                        : selectorName === player.name
                                            ? "bg-blue-300 border-blue-500"
                                            : "bg-gray-100"}
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
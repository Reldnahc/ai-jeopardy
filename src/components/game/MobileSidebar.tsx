import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Player } from "../../types/Lobby.ts";
import Avatar from "../common/Avatar.tsx";
import {useNavigate} from "react-router-dom";

interface MobileSidebarProps {
    isHost: boolean;
    host: string | null;
    players: Player[];
    scores: Record<string, number>;
    lastQuestionValue: number;
    handleScoreUpdate: (player: string, delta: number) => void;
    buzzResult: string | null;
}

const MobileSidebar: React.FC<MobileSidebarProps> = ({
                                                         isHost,
                                                         host,
                                                         players,
                                                         scores,
                                                         lastQuestionValue,
                                                         handleScoreUpdate,
                                                         buzzResult,
                                                     }) => {
    const [isOpen, setIsOpen] = useState(false);
    const navigate = useNavigate();

    return (
        <>
            {/* Toggle Button - kept the same */}
            <button
                onClick={() => setIsOpen(!isOpen)}
                className="fixed bottom-4 left-4 z-50 p-2 rounded-full bg-blue-600 text-white shadow-lg"
            >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    {isOpen ? (
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    ) : (
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                    )}
                </svg>
            </button>

            {/* Sidebar */}
            <AnimatePresence>
                {isOpen && (
                    <motion.div
                        initial={{ x: -300 }}
                        animate={{ x: 0 }}
                        exit={{ x: -300 }}
                        transition={{ type: "spring", bounce: 0, duration: 0.4 }}
                        className="fixed top-0 left-0 h-full w-full max-w-52 bg-gradient-to-r from-indigo-400 to-blue-700 shadow-xl z-40 overflow-y-auto"
                    >
                        <div className="flex flex-col gap-1 p-1 w-full text-sm">
                            <button className="mx-auto w-full text-center text-2xl font-bold text-blue-700 hover:text-blue-500"
                                    onClick={() => navigate('/')}>
                                AI-Jeopardy.com
                            </button>
                            {/* Players List */}
                            <div className="mt-1">
                                <h2 className="text-base font-bold text-white bg-black/20 p-2 rounded-lg mb-1">
                                    Players
                                </h2>
                                <ul className="list-none p-0 m-0 space-y-1">
                                    {players.map((player, index) => (
                                        <li
                                            key={index}
                                            className={`flex items-center p-1.5 rounded-lg text-xs bg-white/90 ${
                                                host === player.name ? "border-l-4 border-yellow-400" :
                                                    buzzResult === player.name ? "border-l-4 border-red-400" : ""
                                            }`}
                                        >
                                            <Avatar name={player.name} size="6" color={player.color} textColor={player.text_color} />
                                            <div className="flex flex-col ml-2 flex-1">
                                                <span className="font-bold text-blue-500">{player.name}</span>
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
                                            {isHost && player.name !== host && (
                                                <div className="flex gap-1">
                                                    <button
                                                        onClick={() => handleScoreUpdate(player.name, -lastQuestionValue)}
                                                        className="w-5 h-5 bg-red-500 text-white rounded-full text-xs"
                                                    >
                                                        −
                                                    </button>
                                                    <button
                                                        onClick={() => handleScoreUpdate(player.name, lastQuestionValue)}
                                                        className="w-5 h-5 bg-green-500 text-white rounded-full text-xs"
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
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Overlay */}
            <AnimatePresence>
                {isOpen && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 0 }}
                        exit={{ opacity: 0 }}
                        onClick={() => setIsOpen(false)}
                        className="fixed inset-0 z-30"
                    />
                )}
            </AnimatePresence>
        </>
    );

};

export default MobileSidebar;
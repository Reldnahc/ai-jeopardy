import React, {useEffect, useMemo, useRef, useState} from "react";
import {motion} from "framer-motion";
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
    onToggleDailyDoubleSnipe: (enabled: boolean) => void;
}

function formatWithCommas(n: number) {
    return Math.trunc(n).toLocaleString();
}

type RollerMoneyProps = {
    value: number;
    className?: string;
};

/**
 * Odometer-style roller:
 * - Each digit is a vertical strip "0..9" sliding in Y to the target digit.
 * - Commas and "$" are static chars (not rolled).
 * - Brief green/red flash based on direction.
 */
function RollerMoney({ value, className }: RollerMoneyProps) {
    const prevRef = useRef<number>(value);
    const [flash, setFlash] = useState<"up" | "down" | null>(null);
    const flashTimeoutRef = useRef<number | null>(null);

    useEffect(() => {
        const prev = prevRef.current;
        if (prev === value) return;

        setFlash(value > prev ? "up" : "down");
        if (flashTimeoutRef.current) window.clearTimeout(flashTimeoutRef.current);
        flashTimeoutRef.current = window.setTimeout(() => setFlash(null), 450);

        prevRef.current = value;
    }, [value]);

    const isNeg = value < 0;
    const absStr = useMemo(() => formatWithCommas(Math.abs(value)), [value]);

    const flashClass =
        flash === "up"
            ? "ring-2 ring-green-400/70 bg-green-500/10"
            : flash === "down"
                ? "ring-2 ring-red-400/70 bg-red-500/10"
                : "";

    return (
        <span
            className={[
                "inline-flex items-center rounded-lg px-2 py-1 transition",
                "tabular-nums select-none",
                flashClass,
                className ?? "",
            ].join(" ")}
        >
            <span className="mr-0.5">$</span>
            {isNeg && <span className="mr-0.5">-</span>}

            {/* The rolling digits */}
            <span className="inline-flex items-center">
                {absStr.split("").map((ch, idx) => {
                    if (ch === ",") {
                        return (
                            <span key={`c-${idx}`} className="mx-[1px]">
                                ,
                            </span>
                        );
                    }

                    const digit = ch.charCodeAt(0) - 48; // '0' -> 0
                    return <DigitRoll key={`d-${idx}`} digit={digit} />;
                })}
            </span>
        </span>
    );
}

function DigitRoll({ digit }: { digit: number }) {
    // This component relies on consistent line-height = 1em
    // and uses translateY in "em" so it scales naturally with font-size.
    const safeDigit = Number.isFinite(digit) ? Math.max(0, Math.min(9, digit)) : 0;

    // Springy, slot-machine-ish motion
    const transition = useMemo(
        () => ({
            type: "spring" as const,
            stiffness: 260,
            damping: 26,
            mass: 0.7,
        }),
        []
    );

    return (
        <span
            className="
                relative inline-block overflow-hidden
                w-[0.72em]
                h-[1em]
                align-baseline
            "
            style={{ lineHeight: "1em" }}
        >
            <motion.div
                className="absolute left-0 top-0"
                animate={{ y: `-${safeDigit}em` }}
                transition={transition}
                style={{ lineHeight: "1em" }}
            >
                {/* 0..9 stacked vertically */}
                {Array.from({ length: 10 }, (_, i) => (
                    <div
                        key={i}
                        className="h-[1em] leading-[1em]"
                        style={{ lineHeight: "1em" }}
                    >
                        {i}
                    </div>
                ))}
            </motion.div>
        </span>
    );
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
                                             onToggleDailyDoubleSnipe
                                         }) => {
    const { profile } = useProfile();
    const [ddSnipeEnabled, setDdSnipeEnabled] = useState(false);

    return (
        <div className="flex-none w-full md:w-64 lg:w-96 flex flex-col gap-5 p-3 overflow-hidden box-border relative h-full">
            <div className="flex flex-col gap-0 w-full" style={{ fontFamily: "'Poppins', sans-serif" }}>
                <div>
                    <h2 className="text-4xl font-extrabold font-swiss911 text-shadow-jeopardy tracking-wider bg-blue-700 text-white px-5 py-5 rounded-lg text-center w-full gap-2.5 shadow-md mb-3">
                        CONTESTANTS
                    </h2>
                    <ul className="list-none p-0 m-0">
                        {players.map((player) => {
                            const score = scores[player.name] ?? 0;

                            return (
                                <li
                                    key={player.name}
                                    className={`
                                        flex items-center
                                        lg:p-2
                                        md:p-1
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
                                    {/* LEFT: Avatar (fixed spot, vertically centered) */}
                                    <div className="flex items-center justify-center shrink-0 pl-2">
                                        <Avatar
                                            name={player.name}
                                            size="12"
                                            color={player.color}
                                            textColor={player.text_color}
                                        />
                                    </div>

                                    {/* RIGHT: Name + Money (stacked) */}
                                    <div className="flex flex-col justify-center flex-1 ml-3 leading-tight min-w-0">
                                        <span className="font-extrabold text-xl lg:text-2xl ml-2 font-sans truncate">
                                          {player.name}
                                        </span>

                                        <RollerMoney
                                            value={score}
                                            className={`mt-1 font-extrabold font-swiss911 tracking-tighter text-shadow-jeopardy text-3xl ${
                                                score < 0 ? "text-red-600" : "text-green-600"
                                            }`}
                                        />
                                    </div>

                                    {/* Admin controls */}
                                    {profile && profile.role === "admin" && (
                                        <div className="flex flex-col gap-2 ml-3 pr-2 shrink-0">
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

                            );
                        })}
                    </ul>
                </div>
            </div>

            {/* Fixed Bottom Section */}
            <div className="absolute bottom-0 left-0 right-0 w-full md:w-64 lg:w-96 flex flex-col items-center gap-5 z-[100]">

                {profile && profile.role === "admin" && activeBoard !== "finalJeopardy" && (
                    <>
                        {/* Daily Double Snipe Toggle */}
                        <button
                            onClick={() => {
                                const next = !ddSnipeEnabled;
                                setDdSnipeEnabled(next);
                                onToggleDailyDoubleSnipe(next);
                            }}
                            className={`
                              px-6 py-3
                              text-white text-lg font-bold
                              rounded-lg
                              min-w-72
                              transition
                              ${ddSnipeEnabled
                                ? "bg-purple-700 hover:bg-purple-800"
                                : "bg-purple-500 hover:bg-purple-600"}
                                `}
                        >
                            {ddSnipeEnabled ? "DD Snipe: ON (Next Clue)" : "Enable DD Snipe (Next Clue)"}
                        </button>

                        {/* Existing Mark All */}
                        <button
                            onClick={markAllCluesComplete}
                            className="px-10 py-5 bg-red-700 text-white text-xl font-bold border-none rounded-lg cursor-pointer min-w-72 hover:bg-red-800"
                        >
                            Mark All Questions Complete
                        </button>
                    </>
                )}

                {/* Bottom Controls Row */}
                <div className="w-full mb-3 flex items-center justify-center relative">
                    {/* Leave button (left side) */}
                    <button
                        type="button"
                        onClick={() => {
                            const ok = window.confirm(
                                "Leave the game?\n\nLeaving means you will quit this game and may not be able to rejoin."
                            );
                            if (ok) onLeaveGame();
                        }}
                        className="
                                  absolute left-4
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

                    {/* Volume (perfectly centered) */}
                    {narrationEnabled && (
                        <div className="flex sm:ml-11 lg:ml-0 items-center gap-3 select-none">
                            <MutedIcon className={"-mr-3"} />

                            <input
                                type="range"
                                min={0}
                                max={200}
                                step={1}
                                value={Math.round(audioVolume * 100)}
                                onChange={(e) => onChangeAudioVolume(Number(e.target.value) / 100)}
                                className="w-32 accent-white cursor-pointer"
                                aria-label="Audio volume"
                            />

                            <LoudIcon className={"-ml-2"} />
                        </div>
                    )}
                </div>

            </div>

        </div>
    );
};

export default Sidebar;

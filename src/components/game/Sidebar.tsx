import React, { useEffect, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import { useProfile } from "../../contexts/ProfileContext.tsx";
import Avatar from "../common/Avatar.tsx";
import { Player } from "../../types/Lobby.ts";
import MutedIcon from "../../icons/MutedIcon.tsx";
import LoudIcon from "../../icons/LoudIcon.tsx";
import { getProfilePresentation } from "../../utils/profilePresentation";

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

            <span className="inline-flex items-center">
        {absStr.split("").map((ch, idx) => {
            if (ch === ",") return <span key={`c-${idx}`} className="mx-[1px]">,</span>;
            const digit = ch.charCodeAt(0) - 48;
            return <DigitRoll key={`d-${idx}`} digit={digit} />;
        })}
      </span>
    </span>
    );
}

function DigitRoll({ digit }: { digit: number }) {
    const safeDigit = Number.isFinite(digit) ? Math.max(0, Math.min(9, digit)) : 0;

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
            className="relative inline-block overflow-hidden w-[0.72em] h-[1em] align-baseline"
            style={{ lineHeight: "1em" }}
        >
      <motion.div
          className="absolute left-0 top-0"
          animate={{ y: `-${safeDigit}em` }}
          transition={transition}
          style={{ lineHeight: "1em" }}
      >
        {Array.from({ length: 10 }, (_, i) => (
            <div key={i} className="h-[1em] leading-[1em]" style={{ lineHeight: "1em" }}>
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
                                             onToggleDailyDoubleSnipe,
                                         }) => {
    // ✅ Same pattern as LobbySidebar:
    const { profile: me, getProfileByUsername, fetchPublicProfiles } = useProfile();
    const [ddSnipeEnabled, setDdSnipeEnabled] = useState(false);

    // Dedup usernames so we don't spam fetches
    const usernames = useMemo(() => {
        const set = new Set<string>();
        for (const p of players) {
            // Prefer stable username if present, otherwise fall back to name
            const u = String(p.username ?? "").trim();
            if (u) set.add(u);
        }
        return Array.from(set);
    }, [players]);

    useEffect(() => {
        if (usernames.length === 0) return;
        void fetchPublicProfiles(usernames).catch(() => {});
    }, [usernames, fetchPublicProfiles]);

    return (
        <div className="flex-none w-full md:w-64 lg:w-96 flex flex-col gap-5 p-3 overflow-hidden box-border relative h-full">
            <div className="flex flex-col gap-0 w-full" style={{ fontFamily: "'Poppins', sans-serif" }}>
                <div>
                    <h2 className="text-4xl font-extrabold font-swiss911 text-shadow-jeopardy tracking-wider bg-blue-700 text-white px-5 py-5 rounded-lg text-center w-full gap-2.5 shadow-md mb-3">
                        CONTESTANTS
                    </h2>

                    <ul className="list-none p-0 m-0">
                        {players.map((player) => {
                            const username = String(player.username ?? "").trim();

                            const publicProfile = username ? getProfileByUsername(username) : null;

                            const pres = getProfilePresentation({
                                profile: publicProfile,
                                fallbackName:  username,
                                defaultNameColor: undefined, // let helper default unless profile has name_color
                            });

                            const score = scores[player.username] ?? 0;

                            return (
                                <li
                                    key={username}
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
                    ${buzzResult === player.username
                                        ? "bg-red-300 border-red-500"
                                        : selectorName === player.displayname
                                            ? "bg-blue-300 border-blue-500"
                                            : "bg-gray-100"}
                  `}
                                >
                                    {/* LEFT: Avatar */}
                                    <div className="flex items-center justify-center shrink-0 pl-2">
                                        <Avatar
                                            name={pres.avatar.nameForLetter}
                                            size="12"
                                            color={pres.avatar.bgColor}
                                            textColor={pres.avatar.fgColor}
                                            icon={pres.avatar.icon}
                                        />
                                    </div>

                                    {/* RIGHT: Name + Money */}
                                    <div className="flex flex-col justify-center flex-1 ml-3 leading-tight min-w-0">
                                        <span
                                            className={[
                                                "text-xl lg:text-2xl ml-2 truncate",
                                                pres.nameClassName,
                                            ].join(" ")}
                                            style={pres.nameStyle}
                                        >
                                          {pres.displayName || username}
                                        </span>

                                        <RollerMoney
                                            value={score}
                                            className={`mt-1 font-extrabold font-swiss911 tracking-tighter text-shadow-jeopardy text-3xl ${
                                                score < 0 ? "text-red-600" : "text-green-600"
                                            }`}
                                        />
                                    </div>

                                    {/* Admin controls */}
                                    {me && me.role === "admin" && (
                                        <div className="flex flex-col gap-2 ml-3 pr-2 shrink-0">
                                            <button
                                                onClick={() => handleScoreUpdate(player.username, lastQuestionValue)}
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
                                                aria-label={`Increase ${player.displayname} score`}
                                                title={`+${lastQuestionValue}`}
                                            >
                                                ＋
                                            </button>

                                            <button
                                                onClick={() => handleScoreUpdate(player.username, -lastQuestionValue)}
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
                                                aria-label={`Decrease ${player.displayname} score`}
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
                {me && me.role === "admin" && activeBoard !== "finalJeopardy" && (
                    <>
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
                ${ddSnipeEnabled ? "bg-purple-700 hover:bg-purple-800" : "bg-purple-500 hover:bg-purple-600"}
              `}
                        >
                            {ddSnipeEnabled ? "DD Snipe: ON (Next Clue)" : "Enable DD Snipe (Next Clue)"}
                        </button>

                        <button
                            onClick={markAllCluesComplete}
                            className="px-10 py-5 bg-red-700 text-white text-xl font-bold border-none rounded-lg cursor-pointer min-w-72 hover:bg-red-800"
                        >
                            Mark All Questions Complete
                        </button>
                    </>
                )}

                <div className="w-full mb-3 flex items-center justify-center relative">
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

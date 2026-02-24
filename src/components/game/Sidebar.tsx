import React, { useEffect, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import { useProfile } from "../../contexts/ProfileContext.tsx";
import { Player } from "../../types/Lobby.ts";
import MutedIcon from "../../icons/MutedIcon.tsx";
import LoudIcon from "../../icons/LoudIcon.tsx";
import MicIcon from "../../icons/MicIcon.tsx";
import SpeakerIcon from "../../icons/SpeakerIcon.tsx";
import { getProfilePresentation } from "../../utils/profilePresentation";
import GamePlayerRow from "./GamePlayerRow.tsx";
import { atLeast } from "../../../shared/roles.ts";
import { useAlert } from "../../contexts/AlertContext.tsx";
import Avatar from "../common/Avatar.tsx";

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
  micPermission: "granted" | "prompt" | "denied" | "unknown";
  showAutoplayReminder: boolean;
  onRequestMicPermission: () => void;
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

function useAutoShrinkText<T extends HTMLElement>(
  text: string,
  minFontSize: number = 11,
  step: number = 1,
) {
  const ref = useRef<T | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    el.style.fontSize = "";

    const computed = window.getComputedStyle(el);
    let currentSize = parseFloat(computed.fontSize);

    while (currentSize > minFontSize && el.scrollWidth > el.clientWidth) {
      currentSize -= step;
      el.style.fontSize = `${currentSize}px`;
    }
  }, [text, minFontSize, step]);

  return ref;
}

function FittedStatusName({
  text,
  className,
  style,
}: {
  text: string;
  className?: string;
  style?: React.CSSProperties;
}) {
  const ref = useAutoShrinkText<HTMLSpanElement>(text);
  return (
    <span
      ref={ref}
      className={["hidden lg:inline text-base truncate leading-none", className ?? ""].join(" ")}
      style={{
        whiteSpace: "nowrap",
        ...style,
      }}
      title={text}
    >
      {text}
    </span>
  );
}

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
          if (ch === ",")
            return (
              <span key={`c-${idx}`} className="mx-[1px]">
                ,
              </span>
            );
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
    [],
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
  micPermission,
  showAutoplayReminder,
  onRequestMicPermission,
  audioVolume,
  onChangeAudioVolume,
  onToggleDailyDoubleSnipe,
}) => {
  const { profile: me, getProfileByUsername, fetchPublicProfiles } = useProfile();
  const { showAlert } = useAlert();
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

  return (
    <div className="flex-none w-full md:w-64 lg:w-96 flex flex-col gap-5 p-3 overflow-hidden box-border relative h-full">
      <div className="flex flex-col gap-0 w-full" style={{ fontFamily: "'Poppins', sans-serif" }}>
        <div>
          <h2 className="text-4xl font-extrabold font-swiss911 text-shadow-jeopardy tracking-wider bg-blue-700 text-white px-5 py-5 rounded-lg text-center w-full gap-2.5 shadow-md mb-3">
            CONTESTANTS
          </h2>

          <div className="mb-3 grid grid-cols-2 gap-2">
            <div className="rounded-md bg-white/85 border border-slate-200 px-2 py-1.5 shadow-sm">
              <div className="text-[10px] uppercase tracking-wide text-slate-500 font-semibold">
                Selector
              </div>
              <div className="mt-1 flex items-center justify-center lg:justify-start gap-2 min-h-8">
                {selectorPlayer ? (
                  <>
                    <Avatar
                      name={selectorPres.avatar.nameForLetter}
                      size="7"
                      color={selectorPres.avatar.bgColor}
                      textColor={selectorPres.avatar.fgColor}
                      icon={selectorPres.avatar.icon}
                    />
                    <FittedStatusName
                      text={selectorPres.displayName}
                      className={selectorPres.nameClassName}
                      style={selectorPres.nameStyle}
                    />
                  </>
                ) : (
                  <FittedStatusName text="None" className="font-semibold text-slate-700" />
                )}
              </div>
            </div>

            <div className="rounded-md bg-white/85 border border-slate-200 px-2 py-1.5 shadow-sm">
              <div className="text-[10px] uppercase tracking-wide text-slate-500 font-semibold">
                Buzzed
              </div>
              <div className="mt-1 flex items-center justify-center lg:justify-start gap-2 min-h-8">
                {buzzedPlayer ? (
                  <>
                    <Avatar
                      name={buzzedPres.avatar.nameForLetter}
                      size="7"
                      color={buzzedPres.avatar.bgColor}
                      textColor={buzzedPres.avatar.fgColor}
                      icon={buzzedPres.avatar.icon}
                    />
                    <FittedStatusName
                      text={buzzedPres.displayName}
                      className={buzzedPres.nameClassName}
                      style={buzzedPres.nameStyle}
                    />
                  </>
                ) : (
                  <FittedStatusName text="None" className="font-semibold text-slate-700" />
                )}
              </div>
            </div>
          </div>

          <ul className="list-none p-0 m-0">
            {players.map((player) => {
              const username = String(player.username ?? "").trim();

              const publicProfile = username ? getProfileByUsername(username) : null;

              const pres = getProfilePresentation({
                profile: publicProfile,
                fallbackName: username,
                defaultNameColor: undefined,
              });

              const score = scores[username] ?? 0;

              return (
                <GamePlayerRow
                  key={username}
                  player={player}
                  username={username}
                  pres={pres}
                  score={score}
                  showScoreButtons={Boolean(me && atLeast(me.role, "admin"))}
                  lastQuestionValue={lastQuestionValue}
                  handleScoreUpdate={handleScoreUpdate}
                  RollerMoney={RollerMoney}
                />
              );
            })}
          </ul>
        </div>
      </div>

      {/* Fixed Bottom Section */}
      <div className="absolute bottom-1 lg:bottom-4 left-0 right-0 w-full md:w-64 lg:w-96 flex flex-col items-center gap-5 z-[100]">
        {(micPermission !== "granted" || showAutoplayReminder) && (
          <div className="w-[92%] flex flex-col gap-1">
            {micPermission !== "granted" && (
              <div className="rounded-md border border-amber-200/80 bg-amber-50 px-2.5 py-2 shadow-sm">
                <div className="text-[11px] text-amber-900 leading-tight flex items-center justify-between gap-2">
                  <span className="inline-flex items-center gap-1.5">
                    <MicIcon className="h-3.5 w-3.5" />
                    Mic permission is needed for voice answers.
                  </span>
                  <button
                    type="button"
                    onClick={onRequestMicPermission}
                    className="shrink-0 rounded-md bg-blue-600 px-2 py-1 text-[11px] font-semibold text-white hover:bg-blue-700"
                  >
                    Allow
                  </button>
                </div>
              </div>
            )}

            {showAutoplayReminder && (
              <div className="rounded-md border border-amber-200/80 bg-amber-50 px-2.5 py-2 shadow-sm">
                <div className="text-[11px] text-amber-900 leading-tight">
                  <span className="inline-flex items-center gap-1.5">
                    <SpeakerIcon className="h-3.5 w-3.5" />
                    Audio blocked. Click anywhere to enable.
                  </span>
                </div>
              </div>
            )}
          </div>
        )}

        {me && atLeast(me.role, "admin") && activeBoard !== "finalJeopardy" && (
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

        <div className="w-full mb-3 lg:mb-4 flex items-center justify-center relative">
          <button
            type="button"
            onClick={() => {
              void showAlert(
                "Leave Game",
                <span>
                  Leaving means you will quit this game, your score will be wiped and you may not be
                  able to rejoin.
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
            }}
            className="
              absolute left-4
              group
              inline-flex items-center justify-center
              w-10 h-10 lg:w-12 lg:h-12
              rounded-lg
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
            <svg
              className="w-5 h-5 lg:w-6 lg:h-6"
              viewBox="0 0 24 24"
              fill="currentColor"
              aria-hidden="true"
            >
              <path d="M10 17l1.41-1.41L8.83 13H20v-2H8.83l2.58-2.59L10 7l-5 5 5 5z" />
            </svg>
          </button>

          {narrationEnabled && (
            <div className="w-full pl-14 lg:pl-16 flex justify-center">
              <div className="flex items-center gap-3 lg:gap-4 select-none">
                <MutedIcon className={"-mr-3"} />

                <input
                  type="range"
                  min={0}
                  max={200}
                  step={1}
                  value={Math.round(audioVolume * 100)}
                  onChange={(e) => onChangeAudioVolume(Number(e.target.value) / 100)}
                  className="w-28 md:w-32 lg:w-44 h-6 accent-white cursor-pointer"
                  aria-label="Audio volume"
                />

                <LoudIcon className={"-ml-2"} />
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default Sidebar;

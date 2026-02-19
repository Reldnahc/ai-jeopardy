import React, { useEffect, useRef } from "react";
import Avatar from "../common/Avatar";
import type { Player } from "../../types/Lobby";
import type { ProfilePresentation } from "../../utils/profilePresentation";

type RollerMoneyComponent = React.ComponentType<{ value: number; className?: string }>;

interface Props {
    player: Player;
    username: string;
    pres: ProfilePresentation;
    score: number;

    // game state
    buzzResult: string | null;
    selectorName: string | null;

    // admin controls
    isAdmin: boolean;
    lastQuestionValue: number;
    handleScoreUpdate: (player: string, delta: number) => void;

    RollerMoney: RollerMoneyComponent;
}

/**
 * Only shrinks if it overflows. Starts at computed font size (Tailwind + pres styles).
 */
function useAutoShrinkText<T extends HTMLElement>(
    text: string,
    minFontSize: number = 16,
    step: number = 1
) {
    const ref = useRef<T | null>(null);

    useEffect(() => {
        const el = ref.current;
        if (!el) return;

        // Reset so we can recompute if name changes / container changes
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

export default function GamePlayerRow({
                                          player,
                                          username,
                                          pres,
                                          score,
                                          buzzResult,
                                          selectorName,
                                          isAdmin,
                                          lastQuestionValue,
                                          handleScoreUpdate,
                                          RollerMoney,
                                      }: Props) {
    const displayName = pres.displayName || username;

    // selectorName in your current code compares to player.displayname (not username).
    // We'll preserve that behavior:
    const isSelector = selectorName != null && selectorName === player.displayname;
    const isBuzzWinner = buzzResult != null && buzzResult === username;

    const nameRef = useAutoShrinkText<HTMLSpanElement>(displayName);

    // Visual overlays for game-state (without clobbering pres.backgroundColor)
    // If you want these to tint instead of ring, change to bg-*-*/10
    const stateRing =
        isBuzzWinner
            ? "ring-2 ring-red-500"
            : isSelector
                ? "ring-2 ring-blue-500"
                : "ring-1 ring-black/10";

    const offlineClass = player.online === false ? "opacity-50" : "";

    return (
        <li
            className={[
                "flex items-center",
                "lg:p-2 md:p-1",
                "min-h-[96px]",
                "rounded-xl mb-3 shadow-sm",
                "transition-transform duration-150 hover:scale-[1.01]",
                "select-none",
                stateRing,
                offlineClass,
            ].join(" ")}
            style={{
                backgroundColor: pres.backgroundColor ?? "#f3f4f6",
                ...(pres.borderStyle ?? {}),
            }}
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
            ref={nameRef}
            className={["text-xl lg:text-2xl ml-2 truncate", pres.nameClassName].join(" ")}
            style={{
                ...pres.nameStyle,
                whiteSpace: "nowrap",
            }}
            title={displayName}
        >
          {displayName}
        </span>

                <RollerMoney
                    value={score}
                    className={[
                        "mt-1 font-extrabold font-swiss911 tracking-tighter text-shadow-jeopardy text-3xl",
                        score < 0 ? "text-red-600" : "text-green-600",
                    ].join(" ")}
                />
            </div>

            {/* Admin controls */}
            {isAdmin && (
                <div className="flex flex-col gap-2 ml-3 pr-2 shrink-0">
                    <button
                        onClick={() => handleScoreUpdate(username, lastQuestionValue)}
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
                        aria-label={`Increase ${displayName} score`}
                        title={`+${lastQuestionValue}`}
                    >
                        ＋
                    </button>

                    <button
                        onClick={() => handleScoreUpdate(username, -lastQuestionValue)}
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
                        aria-label={`Decrease ${displayName} score`}
                        title={`-${lastQuestionValue}`}
                    >
                        −
                    </button>
                </div>
            )}
        </li>
    );
}

import { useEffect, useRef } from "react";
import Avatar from "../common/Avatar";
import type { Player } from "../../types/Lobby";
import type { ProfilePresentation } from "../../utils/profilePresentation";

interface Props {
  player: Player;
  username: string;
  pres: ProfilePresentation;
  isHostRow: boolean;
  isHost: boolean;
  onPromoteHost: (playerUsername: string) => void;
}

function useAutoShrinkText<T extends HTMLElement>(
  text: string,
  minFontSize: number = 16,
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

export default function LobbyPlayerRow({
  username,
  pres,
  isHostRow,
  isHost,
  onPromoteHost,
}: Props) {
  const nameRef = useAutoShrinkText<HTMLSpanElement>(pres.displayName || username);

  return (
    <li
      className={[
        "flex items-center w-full min-h-24 p-3 rounded-xl shadow-md",
        "transition-transform duration-150 hover:scale-[1.015]",
        "select-none",
      ].join(" ")}
      style={{
        backgroundColor: pres.backgroundColor ?? "#f3f4f6",
        ...(pres.borderStyle ?? {}),
      }}
    >
      <Avatar
        name={pres.avatar.nameForLetter}
        size="12"
        color={pres.avatar.bgColor}
        textColor={pres.avatar.fgColor}
        icon={pres.avatar.icon}
      />

      <div className="flex flex-col ml-4 min-w-0 flex-1">
        <span
          ref={nameRef}
          className={[
            pres.nameClassName,
            "block truncate text-2xl",
            isHostRow ? "font-bold" : "",
          ].join(" ")}
          style={{
            ...pres.nameStyle,
            whiteSpace: "nowrap",
          }}
          title={pres.displayName || username}
        >
          {pres.displayName || username}
        </span>

        {isHost && !isHostRow && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onPromoteHost(username);
            }}
            className="mt-1 px-2 py-0.5 rounded text-[11px] bg-blue-600/90 text-white hover:bg-blue-500 w-fit leading-tight"
          >
            Make Host
          </button>
        )}

        {isHostRow && <span className="text-yellow-400 text-xs -mt-1">Host</span>}
      </div>
    </li>
  );
}

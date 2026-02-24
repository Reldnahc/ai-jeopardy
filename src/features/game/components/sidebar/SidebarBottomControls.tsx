import React, { useState } from "react";
import MicIcon from "../../../../icons/MicIcon.tsx";
import SpeakerIcon from "../../../../icons/SpeakerIcon.tsx";
import MutedIcon from "../../../../icons/MutedIcon.tsx";
import LoudIcon from "../../../../icons/LoudIcon.tsx";

interface SidebarBottomControlsProps {
  micPermission: "granted" | "prompt" | "denied" | "unknown";
  showAutoplayReminder: boolean;
  onRequestMicPermission: () => void;
  isAdmin: boolean;
  activeBoard: string;
  markAllCluesComplete: () => void;
  onToggleDailyDoubleSnipe: (enabled: boolean) => void;
  narrationEnabled: boolean;
  audioVolume: number;
  onChangeAudioVolume: (v: number) => void;
  onTryLeaveGame: () => void;
}

const SidebarBottomControls: React.FC<SidebarBottomControlsProps> = ({
  micPermission,
  showAutoplayReminder,
  onRequestMicPermission,
  isAdmin,
  activeBoard,
  markAllCluesComplete,
  onToggleDailyDoubleSnipe,
  narrationEnabled,
  audioVolume,
  onChangeAudioVolume,
  onTryLeaveGame,
}) => {
  const [ddSnipeEnabled, setDdSnipeEnabled] = useState(false);

  return (
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

      {isAdmin && activeBoard !== "finalJeopardy" && (
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
          onClick={onTryLeaveGame}
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
  );
};

export default SidebarBottomControls;

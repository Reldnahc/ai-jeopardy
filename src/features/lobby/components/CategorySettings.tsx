import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { CategoryPoolState, LobbySettings } from "../socket/useLobbySocketSync.types.ts";
import LockIcon from "../../../icons/LockIcon.tsx";

type Props = {
  isHost: boolean;
  lobbySettings: LobbySettings | null;
  categoryPoolState: CategoryPoolState | null;
  onToggleLock: (nextLocked: boolean) => void;
  onRefreshPool: () => void;
  onUpdatePrompt: (prompt: string) => void;
};

function formatCountdown(ms: number) {
  const totalSec = Math.max(0, Math.floor(ms / 1000));
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  return `${min}:${sec.toString().padStart(2, "0")}`;
}

const CategorySettings: React.FC<Props> = ({
  isHost,
  lobbySettings,
  categoryPoolState,
  onToggleLock,
  onRefreshPool,
  onUpdatePrompt,
}) => {
  const locked = Boolean(lobbySettings?.categoryRefreshLocked);
  const promptValue = String(lobbySettings?.categoryPoolPrompt ?? "");
  const nextAllowedAt = categoryPoolState?.nextAllowedAtMs ?? null;
  const isGenerating = Boolean(categoryPoolState?.generating);

  const [nowMs, setNowMs] = useState(Date.now());
  const [localPrompt, setLocalPrompt] = useState(promptValue);
  const lastSentRef = useRef(promptValue);

  useEffect(() => {
    const id = window.setInterval(() => setNowMs(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    setLocalPrompt(promptValue);
    lastSentRef.current = promptValue;
  }, [promptValue]);

  const onUpdatePromptStable = useCallback(onUpdatePrompt, [onUpdatePrompt]);

  useEffect(() => {
    if (locked) return;
    const trimmed = localPrompt.trim();
    if (trimmed === lastSentRef.current) return;

    const id = window.setTimeout(() => {
      lastSentRef.current = trimmed;
      onUpdatePromptStable(trimmed);
    }, 400);

    return () => window.clearTimeout(id);
  }, [localPrompt, locked, onUpdatePromptStable]);

  const remainingMs = useMemo(() => {
    if (!nextAllowedAt) return 0;
    return Math.max(0, nextAllowedAt - nowMs);
  }, [nextAllowedAt, nowMs]);

  const cooldownActive = remainingMs > 0;
  const canRefresh = !isGenerating && !cooldownActive && !locked;

  return (
    <div className="mb-8 rounded-xl border border-slate-200 bg-white/90 p-6 shadow-md">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h3 className="text-2xl font-extrabold tracking-wide text-slate-800">
            Category Settings
          </h3>
          <p className="text-sm text-slate-600 mt-1">
            Generate a fresh pool of categories for the lobby.
          </p>
        </div>

        <div className="flex items-center gap-4">
          {isHost ? (
            <button
              type="button"
              onClick={() => onToggleLock(!locked)}
              className={`text-[1rem] py-[10px] px-[15px] ${
                locked ? "bg-red-600" : "bg-indigo-500"
              } text-white rounded cursor-pointer`}
              title={locked ? "Unlock" : "Lock"}
            >
              <LockIcon />
            </button>
          ) : (
            <span
              className={`px-3 py-1 rounded-md text-xs font-semibold ${
                locked ? "bg-red-100 text-red-700" : "bg-green-100 text-green-700"
              }`}
            >
              {locked ? "Locked by host" : "Unlocked"}
            </span>
          )}

          <button
            type="button"
            disabled={!canRefresh}
            onClick={onRefreshPool}
            className={`px-4 py-2 rounded-md text-sm font-semibold ${
              canRefresh
                ? "bg-blue-600 text-white hover:bg-blue-500"
                : "bg-slate-200 text-slate-500 cursor-not-allowed"
            }`}
          >
            {isGenerating ? "Generating..." : "Generate New Pool"}
          </button>
        </div>
      </div>

      <div className="mt-4 text-sm text-slate-600">
        {cooldownActive ? (
          <span>Cooldown: {formatCountdown(remainingMs)}</span>
        ) : (
          <span>Cooldown: Ready</span>
        )}
      </div>

      <div className="mt-4">
        <label className="block text-sm font-semibold text-slate-700 mb-2">
          Category Prompt
        </label>
        <textarea
          value={localPrompt}
          onChange={(e) => setLocalPrompt(e.target.value)}
          disabled={locked}
          placeholder="Describe the vibe or theme for category ideas..."
          className={`w-full min-h-[80px] rounded-md border px-3 py-2 text-sm ${
            locked
              ? "bg-gray-100 text-gray-500 border-gray-300 cursor-not-allowed"
              : "bg-white text-slate-800 border-slate-300"
          }`}
        />
      </div>
    </div>
  );
};

export default CategorySettings;

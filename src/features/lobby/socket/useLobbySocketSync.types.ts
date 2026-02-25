import type React from "react";
import type { AlertButton } from "../../../contexts/AlertContext.tsx";

export type LockedCategories = {
  firstBoard: boolean[];
  secondBoard: boolean[];
  finalJeopardy: boolean[];
};

export type LobbySettings = {
  timeToBuzz: number;
  timeToAnswer: number;
  selectedModel: string;
  reasoningEffort: "off" | "low" | "medium" | "high";
  visualMode: "off" | "commons" | "brave";
  narrationEnabled: boolean;
  boardJson: string;
  categoryRefreshLocked?: boolean;
  categoryPoolPrompt?: string;
};

export type CategoryPoolState = {
  nextAllowedAtMs: number | null;
  lastGeneratedAtMs: number | null;
  generating: boolean;
};

export type UseLobbySocketSyncArgs = {
  gameId?: string;
  playerKey: string | null;
  username: string | null;
  displayname: string | null;
  showAlert: (
    header: React.ReactNode,
    node: React.ReactNode,
    actions: AlertButton[],
  ) => Promise<string>;
};

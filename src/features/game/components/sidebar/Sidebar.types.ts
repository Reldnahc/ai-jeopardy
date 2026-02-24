import type { Player } from "../../../../types/Lobby.ts";

export interface SidebarProps {
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
  audioVolume: number;
  onChangeAudioVolume: (v: number) => void;
  onToggleDailyDoubleSnipe: (enabled: boolean) => void;
}

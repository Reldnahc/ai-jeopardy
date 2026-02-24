import type { models } from "../../../../shared/models.js";
import type { LobbySettings } from "../socket/useLobbySocketSync.tsx";

export type ReasoningEffortSetting = "off" | "low" | "medium" | "high";
export type ModelDef = (typeof models)[number];

export interface HostControlsProps {
  lobbySettings: LobbySettings | null;
  updateLobbySettings: (patch: Partial<LobbySettings>) => void;

  isSoloLobby: boolean;

  boardJsonError: string | null;
  setBoardJsonError: (value: string | null) => void;
  tryValidateBoardJson: (raw: string) => string | null;

  onCreateGame: () => void;
}

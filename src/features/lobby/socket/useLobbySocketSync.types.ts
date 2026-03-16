import type React from "react";
import type { AlertButton } from "../../../contexts/AlertContext.tsx";

export type { CategoryPoolState, LobbySettings, LockedCategories } from "../../../../shared/types/lobby.ts";

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

import type React from "react";
import type { Player } from "../../../types/Lobby.ts";
import type { BoardType } from "../../../utils/lobbySections.ts";
import type { AlertButton } from "../../../contexts/AlertContext.tsx";
import type { LobbySettings, LockedCategories } from "./useLobbySocketSync.types.ts";

export type LobbySocketMessage = { type?: string; [key: string]: unknown };

export type LobbySocketRouterDeps = {
  gameId?: string;
  username: string | null;
  requestLobbyState: () => void;
  showAlert: (
    header: React.ReactNode,
    node: React.ReactNode,
    actions: AlertButton[],
  ) => Promise<string>;
  setLobbyInvalid: (value: boolean) => void;
  setInvalidReason: (value: "missing_identity" | "not_found_or_started" | "full" | null) => void;
  setIsLoading: (value: boolean) => void;
  setLoadingMessage: (value: string) => void;
  setLoadingProgress: (value: number | null) => void;
  setPlayers: (value: Player[]) => void;
  setHost: (value: string | null) => void;
  setIsHostServer: (value: boolean) => void;
  setAllowLeave: (value: boolean) => void;
  setPreloadAssetIds: (value: string[] | null | ((prev: string[] | null) => string[] | null)) => void;
  setIsPreloadingImages: (value: boolean) => void;
  setPreloadTtsAssetIds: (
    value: string[] | null | ((prev: string[] | null) => string[] | null),
  ) => void;
  setIsPreloadingAudio: (value: boolean) => void;
  setPreloadToken: (value: number | null) => void;
  setPreloadFinalToken: (value: number | null) => void;
  setCategories: (
    value:
      | Record<BoardType, string[]>
      | ((prev: Record<BoardType, string[]>) => Record<BoardType, string[]>),
  ) => void;
  unflattenBySections: (categories: string[]) => Record<BoardType, string[]>;
  setLockedCategories: (
    value: LockedCategories | ((prev: LockedCategories) => LockedCategories),
  ) => void;
  setLobbySettings: (value: LobbySettings | null) => void;
};

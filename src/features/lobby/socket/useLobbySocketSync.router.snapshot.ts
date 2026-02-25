import type { Player } from "../../../types/Lobby.ts";
import type { LobbySocketMessage, LobbySocketRouterDeps } from "./useLobbySocketSync.router.shared.ts";
import type { LockedCategories, LobbySettings } from "./useLobbySocketSync.types.ts";

export function routeLobbySnapshotMessage(
  message: LobbySocketMessage,
  d: LobbySocketRouterDeps,
): boolean {
  if (message.type === "player-list-update") {
    const m = message as { players: Player[]; host: string };

    const hostUsername = String(m.host ?? "")
      .trim()
      .toLowerCase();

    const sortedPlayers = [...(m.players ?? [])].sort((a, b) => {
      const au = String(a.username ?? "")
        .trim()
        .toLowerCase();
      const bu = String(b.username ?? "")
        .trim()
        .toLowerCase();
      if (au === hostUsername) return -1;
      if (bu === hostUsername) return 1;
      return 0;
    });

    d.setPlayers(sortedPlayers);
    d.setHost(hostUsername || null);

    const youU = String(d.username ?? "")
      .trim()
      .toLowerCase();
    d.setIsHostServer(Boolean(hostUsername) && Boolean(youU) && hostUsername === youU);
    return true;
  }

  if (message.type === "lobby-state") {
    const m = message as {
      players: Player[];
      host: string;
      categories?: string[];
      inLobby?: boolean;
      isGenerating?: boolean;
      isLoading?: boolean;
      generationProgress?: number | null;
      lockedCategories?: LockedCategories;
      you?: { isHost?: boolean; playerName?: string; playerKey?: string };
      lobbySettings?: LobbySettings | null;
      categoryPoolState?: {
        nextAllowedAtMs?: number | null;
        lastGeneratedAtMs?: number | null;
        generating?: boolean;
      };
    };

    d.setPlayers(Array.isArray(m.players) ? m.players : []);
    d.setHost(m.host ?? null);

    const hostUsername = String(m.host ?? "")
      .trim()
      .toLowerCase();
    const youUsername = String(d.username ?? "")
      .trim()
      .toLowerCase();

    d.setIsHostServer(
      Boolean(m.you?.isHost) || (!!hostUsername && !!youUsername && hostUsername === youUsername),
    );

    if (Array.isArray(m.categories)) {
      d.setCategories(d.unflattenBySections(m.categories));
    }

    if (m.lockedCategories) {
      d.setLockedCategories({
        firstBoard: m.lockedCategories.firstBoard,
        secondBoard: m.lockedCategories.secondBoard,
        finalJeopardy: m.lockedCategories.finalJeopardy,
      });
    }

    if (m.lobbySettings) {
      d.setLobbySettings(m.lobbySettings);
    }

    if (m.categoryPoolState) {
      d.setCategoryPoolState({
        nextAllowedAtMs: m.categoryPoolState.nextAllowedAtMs ?? null,
        lastGeneratedAtMs: m.categoryPoolState.lastGeneratedAtMs ?? null,
        generating: Boolean(m.categoryPoolState.generating),
      });
    }

    if (m.isGenerating) {
      d.setIsLoading(true);
      d.setLoadingMessage("Generating your questions...");
      d.setLoadingProgress(typeof m.generationProgress === "number" ? m.generationProgress : 0);
      return true;
    }

    if (m.isLoading === false) {
      return true;
    }

    if (m.inLobby === false) {
      d.setAllowLeave(true);
      return true;
    }

    d.setIsLoading(false);
    d.setLoadingMessage("");
    return true;
  }

  if (message.type === "category-lock-updated") {
    const m = message as { boardType: unknown; index: number; locked: boolean };
    const bt = m.boardType;
    if (bt === "firstBoard" || bt === "secondBoard" || bt === "finalJeopardy") {
      d.setLockedCategories((prev) => {
        const updated: LockedCategories = { ...prev };
        updated[bt][m.index] = Boolean(m.locked);
        return updated;
      });
    }
    return true;
  }

  if (message.type === "category-updated") {
    const m = message as {
      boardType: "firstBoard" | "secondBoard" | "finalJeopardy";
      index: number;
      value: string;
    };

    d.setCategories((prev) => {
      const nextBoard = [...(prev[m.boardType] ?? [])];
      if (m.index >= 0 && m.index < nextBoard.length) nextBoard[m.index] = m.value ?? "";
      return { ...prev, [m.boardType]: nextBoard };
    });
    return true;
  }

  if (message.type === "categories-updated") {
    const m = message as { categories: string[] };
    if (Array.isArray(m.categories)) d.setCategories(d.unflattenBySections(m.categories));
    return true;
  }

  if (message.type === "lobby-settings-updated") {
    const m = message as { lobbySettings?: LobbySettings | null };
    if (m.lobbySettings) d.setLobbySettings(m.lobbySettings);
    return true;
  }

  if (message.type === "category-pool-status") {
    const m = message as {
      nextAllowedAtMs?: number | null;
      lastGeneratedAtMs?: number | null;
      generating?: boolean;
    };
    d.setCategoryPoolState({
      nextAllowedAtMs: m.nextAllowedAtMs ?? null,
      lastGeneratedAtMs: m.lastGeneratedAtMs ?? null,
      generating: Boolean(m.generating),
    });
    return true;
  }

  return false;
}

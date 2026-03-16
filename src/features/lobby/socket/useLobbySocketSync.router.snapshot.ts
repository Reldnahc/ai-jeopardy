import type { LobbySocketMessage, LobbySocketRouterDeps } from "./useLobbySocketSync.router.shared.ts";
import type { LockedCategories } from "./useLobbySocketSync.types.ts";
import {
  isCategoriesUpdatedMessage,
  isCategoryLockUpdatedMessage,
  isCategoryPoolStatusMessage,
  isCategoryUpdatedMessage,
  isLobbySettingsUpdatedMessage,
  isLobbyStateMessage,
  isPlayerListUpdateMessage,
} from "../../../../shared/types/lobby.ts";

export function routeLobbySnapshotMessage(
  message: LobbySocketMessage,
  d: LobbySocketRouterDeps,
): boolean {
  if (isPlayerListUpdateMessage(message)) {
    const m = message;

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

  if (isLobbyStateMessage(message)) {
    const m = message;

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

  if (isCategoryLockUpdatedMessage(message)) {
    const m = message;
    const bt = m.boardType;
    d.setLockedCategories((prev) => {
      const updated: LockedCategories = { ...prev };
      updated[bt][m.index] = Boolean(m.locked);
      return updated;
    });
    return true;
  }

  if (isCategoryUpdatedMessage(message)) {
    const m = message;

    d.setCategories((prev) => {
      const nextBoard = [...(prev[m.boardType] ?? [])];
      if (m.index >= 0 && m.index < nextBoard.length) nextBoard[m.index] = m.value ?? "";
      return { ...prev, [m.boardType]: nextBoard };
    });
    return true;
  }

  if (isCategoriesUpdatedMessage(message)) {
    d.setCategories(d.unflattenBySections(message.categories));
    return true;
  }

  if (isLobbySettingsUpdatedMessage(message)) {
    d.setLobbySettings(message.lobbySettings);
    return true;
  }

  if (isCategoryPoolStatusMessage(message)) {
    const m = message;
    d.setCategoryPoolState({
      nextAllowedAtMs: m.nextAllowedAtMs ?? null,
      lastGeneratedAtMs: m.lastGeneratedAtMs ?? null,
      generating: Boolean(m.generating),
    });
    return true;
  }

  return false;
}

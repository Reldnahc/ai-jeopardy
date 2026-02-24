import type { LobbySocketMessage, LobbySocketRouterDeps } from "./useLobbySocketSync.router.shared.ts";

export function routeLobbyControlMessage(
  message: LobbySocketMessage,
  d: LobbySocketRouterDeps,
): boolean {
  if (message.type === "check-lobby-response") {
    const m = message as { isValid: boolean };

    if (!m.isValid) {
      if (d.username) {
        d.setIsLoading(true);
        d.setLoadingMessage("Game already started. Joining game...");
        d.setAllowLeave(true);
        return true;
      }

      d.setLobbyInvalid(true);
      d.setInvalidReason("missing_identity");
      return true;
    }

    d.setLoadingMessage("Syncing lobby state...");
    d.requestLobbyState();
    return true;
  }

  if (message.type === "error") {
    if (d.gameId) d.requestLobbyState();
    return true;
  }

  return false;
}

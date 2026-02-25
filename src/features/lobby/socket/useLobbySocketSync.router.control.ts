import type { LobbySocketMessage, LobbySocketRouterDeps } from "./useLobbySocketSync.router.shared.ts";

export function routeLobbyControlMessage(
  message: LobbySocketMessage,
  d: LobbySocketRouterDeps,
): boolean {
  if (message.type === "check-lobby-response") {
    const m = message as { isValid: boolean; isFull?: boolean; maxPlayers?: number };

    if (!m.isValid) {
      if (m.isFull) {
        const msg =
          typeof m.maxPlayers === "number"
            ? `Lobby is full (max ${m.maxPlayers} players).`
            : "Lobby is full.";
        void d.showAlert("Lobby Full", msg, [
          {
            label: "Okay",
            actionValue: "okay",
            styleClass: "bg-green-500 text-white hover:bg-green-600",
          },
        ]);
        d.setLobbyInvalid(true);
        d.setInvalidReason("full");
        return true;
      }

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
    const m = message as { message?: string };
    const msg = String(m.message ?? "");
    if (msg.toLowerCase().includes("lobby is full")) {
      void d.showAlert("Lobby Full", msg, [
        {
          label: "Okay",
          actionValue: "okay",
          styleClass: "bg-green-500 text-white hover:bg-green-600",
        },
      ]);
      d.setLobbyInvalid(true);
      d.setInvalidReason("full");
      return true;
    }

    if (d.gameId) d.requestLobbyState();
    return true;
  }

  return false;
}

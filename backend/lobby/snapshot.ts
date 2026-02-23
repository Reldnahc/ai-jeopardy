import { games } from "../state/gamesStore.js";
import { normalizeCategories11 } from "../validation/boardImport.js";
import type { GameState, PlayerState, SocketState } from "../types/runtime.js";

export const buildLobbyState = (gameId: string, ws: SocketState) => {
  const game = games[gameId];
  if (!game) return null;

  const you = game.players?.find((p: PlayerState) => p.id === ws.id) || null;

  return {
    type: "lobby-state",
    gameId,
    players: game.players.map((p: PlayerState) => ({
      username: p.username,
      displayname: p.displayname,
      online: p?.online !== false,
    })),
    host: game.host,
    categories: normalizeCategories11(game.categories),
    lockedCategories: game.lockedCategories,
    inLobby: game.inLobby,
    lobbySettings: game.lobbySettings ?? null,
    isGenerating: Boolean(game.isGenerating),
    isLoading: Boolean(game.isLoading),
    generationProgress:
      typeof game.generationProgress === "number" ? game.generationProgress : null,
    generationDone: typeof game.generationDone === "number" ? game.generationDone : null,
    generationTotal: typeof game.generationTotal === "number" ? game.generationTotal : null,
    you: you
      ? {
          username: you.username,
          displayname: you.displayname,
          isHost:
            String(you.username ?? "")
              .trim()
              .toLowerCase() ===
            String(game.host ?? "")
              .trim()
              .toLowerCase(),
        }
      : null,
  };
};

export const getPlayerForSocket = (
  game: GameState | null | undefined,
  ws: SocketState | null | undefined,
): PlayerState | null => {
  if (!game || !ws) return null;
  return (game.players || []).find((p: PlayerState) => p.id === ws.id) || null;
};

export const sendLobbySnapshot = (ws: SocketState, gameId: string) => {
  const snap = buildLobbyState(gameId, ws);
  if (snap) ws.send(JSON.stringify(snap));
};
